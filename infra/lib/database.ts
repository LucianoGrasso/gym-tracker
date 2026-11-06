import { Duration, RemovalPolicy, SecretValue } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';

export const DB_NAME = 'gymtracker';
export const DB_USER = 'gymtracker';

export interface DatabaseProps {
  /** Contraseña maestra (parámetro NoEcho; su valor vive en SSM). */
  readonly password: SecretValue;
}

/** VPC sin salida a internet + Aurora Serverless v2 que se pausa sola. */
export class Database extends Construct {
  readonly vpc: ec2.Vpc;
  readonly cluster: rds.DatabaseCluster;
  /** Security group que deben usar las Lambdas para llegar a Postgres. */
  readonly clientSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);

    // Solo subredes aisladas: sin NAT (USD ~32/mes) ni IPs públicas.
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{ name: 'isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 }],
    });

    this.clientSecurityGroup = new ec2.SecurityGroup(this, 'ClientSg', {
      vpc: this.vpc,
      description: 'Lambdas de GymTracker',
    });

    this.cluster = new rds.DatabaseCluster(this, 'Cluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_17_9 }),
      writer: rds.ClusterInstance.serverlessV2('Writer'),
      serverlessV2MinCapacity: 0,
      serverlessV2MaxCapacity: 2,
      // 5 min es el mínimo de AWS: con más usuarios, menos horas despierta = menos costo.
      serverlessV2AutoPauseDuration: Duration.minutes(5),
      credentials: rds.Credentials.fromPassword(DB_USER, props.password),
      defaultDatabaseName: DB_NAME,
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      storageEncrypted: true,
      backup: { retention: Duration.days(7) },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.SNAPSHOT,
    });

    // Aviso esperado al sintetizar (W1011): la contraseña llega como parámetro NoEcho y no como
    // ssm-secure, porque la Lambda la necesita en su entorno y ahí CloudFormation no admite ssm-secure.
    this.cluster.connections.allowDefaultPortFrom(this.clientSecurityGroup, 'Lambdas a Postgres');
  }
}
