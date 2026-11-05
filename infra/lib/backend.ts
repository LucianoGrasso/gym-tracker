import { ConsoleFunction, PhpFpmFunction, packagePhpCode } from '@bref.sh/constructs';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface BackendProps {
  /** Carpeta de Laravel instalada sin dependencias de desarrollo. */
  readonly codePath: string;
  readonly vpc: ec2.IVpc;
  readonly securityGroup: ec2.ISecurityGroup;
  readonly environment: Record<string, string>;
}

/** Laravel en Lambda con Bref: una función HTTP (PHP-FPM) y otra de consola (artisan). */
export class Backend extends Construct {
  readonly http: PhpFpmFunction;
  readonly artisan: ConsoleFunction;
  readonly api: apigwv2.HttpApi;

  constructor(scope: Construct, id: string, props: BackendProps) {
    super(scope, id);

    const code = packagePhpCode(props.codePath, {
      exclude: ['.env', '.env.*', 'storage/logs/*.log', 'database/*.sqlite', 'Dockerfile.dev'],
    });
    const logGroup = (name: string) =>
      new logs.LogGroup(this, `${name}Logs`, {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      });
    const shared = {
      code,
      phpVersion: '8.5' as const,
      memorySize: 1024,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [props.securityGroup],
      environment: props.environment,
    };

    this.http = new PhpFpmFunction(this, 'Http', {
      ...shared,
      functionName: 'gymtracker-http',
      handler: 'public/index.php',
      logGroup: logGroup('Http'),
    });

    // Migraciones, crear usuario y despertar Aurora: el arranque de Aurora (~15 s) cabe de sobra.
    this.artisan = new ConsoleFunction(this, 'Artisan', {
      ...shared,
      functionName: 'gymtracker-artisan',
      handler: 'artisan',
      timeout: Duration.minutes(2),
      logGroup: logGroup('Artisan'),
    });

    this.api = new apigwv2.HttpApi(this, 'Api', {
      description: 'GymTracker (solo se usa detrás de CloudFront)',
      defaultIntegration: new HttpLambdaIntegration('Laravel', this.http),
    });
  }
}
