import { ArnFormat, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import * as path from 'node:path';

export const PUSH_FUNCTION_NAME = 'gymtracker-push';
export const REST_STATE_MACHINE_NAME = 'gymtracker-rest';

export interface PushProps {
  readonly api: apigwv2.HttpApi;
  readonly signingKey: string;
  readonly vapidPublicKey: string;
  readonly vapidPrivateKey: string;
}

/**
 * Avisos de fin de descanso. La Lambda va fuera de la VPC (necesita internet para los servicios
 * de push y no usa Aurora). El temporizador es una máquina de estados Standard: su `Wait` es
 * preciso al segundo (EventBridge Scheduler tiene precisión de 60 s) y dura más de 5 min (Express no).
 */
export class Push extends Construct {
  readonly fn: NodejsFunction;

  constructor(scope: Construct, id: string, props: PushProps) {
    super(scope, id);
    const stack = Stack.of(this);

    // ARN armado con el nombre fijo: la máquina invoca a la Lambda, así que la Lambda no puede depender de ella.
    const stateMachineArn = stack.formatArn({
      service: 'states',
      resource: 'stateMachine',
      resourceName: REST_STATE_MACHINE_NAME,
      arnFormat: ArnFormat.COLON_RESOURCE_NAME,
    });
    const executions = stack.formatArn({
      service: 'states',
      resource: 'execution',
      resourceName: `${REST_STATE_MACHINE_NAME}:*`,
      arnFormat: ArnFormat.COLON_RESOURCE_NAME,
    });

    this.fn = new NodejsFunction(this, 'Function', {
      functionName: PUSH_FUNCTION_NAME,
      entry: path.join(__dirname, '../lambda/push/index.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      logGroup: new logs.LogGroup(this, 'Logs', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      bundling: { format: OutputFormat.CJS, minify: true },
      environment: {
        PUSH_SIGNING_KEY: props.signingKey,
        VAPID_PUBLIC_KEY: props.vapidPublicKey,
        VAPID_PRIVATE_KEY: props.vapidPrivateKey,
        STATE_MACHINE_ARN: stateMachineArn,
      },
    });
    this.fn.addToRolePolicy(new iam.PolicyStatement({ actions: ['states:StartExecution'], resources: [stateMachineArn] }));
    this.fn.addToRolePolicy(new iam.PolicyStatement({ actions: ['states:StopExecution'], resources: [executions] }));

    const send = new tasks.LambdaInvoke(this, 'Send', {
      lambdaFunction: this.fn,
      payload: sfn.TaskInput.fromObject({
        kind: 'send',
        subscription: sfn.JsonPath.objectAt('$.subscription'),
        title: sfn.JsonPath.stringAt('$.title'),
        body: sfn.JsonPath.stringAt('$.body'),
        url: sfn.JsonPath.stringAt('$.url'),
      }),
      // Un aviso atrasado no sirve: sin reintentos.
      retryOnServiceExceptions: false,
    });
    new sfn.StateMachine(this, 'RestTimer', {
      stateMachineName: REST_STATE_MACHINE_NAME,
      stateMachineType: sfn.StateMachineType.STANDARD,
      comment: 'Espera el descanso y manda el aviso push',
      definitionBody: sfn.DefinitionBody.fromChainable(
        new sfn.Wait(this, 'Wait', { time: sfn.WaitTime.secondsPath('$.seconds') }).next(send),
      ),
    });

    props.api.addRoutes({
      path: '/push/{proxy+}',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('Push', this.fn),
    });
  }
}
