import { ArnFormat, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import { Construct } from 'constructs';
import * as path from 'node:path';

export const PUSH_FUNCTION_NAME = 'gymtracker-push';
export const REST_SCHEDULE_GROUP = 'gymtracker-rest';

export interface PushProps {
  readonly api: apigwv2.HttpApi;
  readonly signingKey: string;
  readonly vapidPublicKey: string;
  readonly vapidPrivateKey: string;
}

/**
 * Avisos de fin de descanso. Fuera de la VPC (necesita internet para Scheduler y los servicios
 * de push, y no usa Aurora): así no hace falta NAT ni VPC endpoints.
 */
export class Push extends Construct {
  readonly fn: NodejsFunction;

  constructor(scope: Construct, id: string, props: PushProps) {
    super(scope, id);
    const stack = Stack.of(this);

    new scheduler.CfnScheduleGroup(this, 'Group', { name: REST_SCHEDULE_GROUP });

    // ARN armado con el nombre fijo: referenciar fn.functionArn en su propio entorno sería circular.
    const targetArn = stack.formatArn({
      service: 'lambda',
      resource: 'function',
      resourceName: PUSH_FUNCTION_NAME,
      arnFormat: ArnFormat.COLON_RESOURCE_NAME,
    });
    const schedulerRole = new iam.Role(this, 'SchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
      description: 'Scheduler invoca la Lambda de push al terminar un descanso',
    });
    schedulerRole.addToPolicy(new iam.PolicyStatement({ actions: ['lambda:InvokeFunction'], resources: [targetArn] }));

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
        SCHEDULE_GROUP: REST_SCHEDULE_GROUP,
        SCHEDULER_ROLE_ARN: schedulerRole.roleArn,
        TARGET_ARN: targetArn,
      },
    });

    this.fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['scheduler:CreateSchedule', 'scheduler:UpdateSchedule', 'scheduler:DeleteSchedule'],
        resources: [
          stack.formatArn({ service: 'scheduler', resource: 'schedule', resourceName: `${REST_SCHEDULE_GROUP}/*` }),
        ],
      }),
    );
    this.fn.addToRolePolicy(new iam.PolicyStatement({ actions: ['iam:PassRole'], resources: [schedulerRole.roleArn] }));

    props.api.addRoutes({
      path: '/push/{proxy+}',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('Push', this.fn),
    });
  }
}
