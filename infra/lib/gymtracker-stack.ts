import { CfnParameter, SecretValue, Stack, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Backend } from './backend';
import { DB_NAME, DB_USER, Database } from './database';
import { WarmUp, type WarmUpSchedule } from './warm-up';

export type { WarmUpSchedule } from './warm-up';

export interface GymTrackerStackProps extends StackProps {
  /** Carpeta de Laravel ya instalada con `composer install --no-dev`. */
  readonly backendPath: string;
  /** Salida de `ng build` (`frontend/dist/frontend/browser`). */
  readonly frontendPath: string;
  /** Hora del despertar programado de Aurora (America/Santiago). */
  readonly warmUp: WarmUpSchedule;
}

export class GymTrackerStack extends Stack {
  constructor(scope: Construct, id: string, props: GymTrackerStackProps) {
    super(scope, id, props);

    // Los valores reales viven en SSM (SecureString); el workflow los pasa al desplegar.
    const appKey = new CfnParameter(this, 'AppKey', {
      type: 'String',
      noEcho: true,
      description: 'APP_KEY de Laravel (base64:...)',
    });
    const dbPassword = new CfnParameter(this, 'DbPassword', {
      type: 'String',
      noEcho: true,
      minLength: 16,
      description: 'Contraseña maestra de Aurora',
    });

    const database = new Database(this, 'Database', { password: SecretValue.cfnParameter(dbPassword) });
    const backend = new Backend(this, 'Backend', {
      codePath: props.backendPath,
      vpc: database.vpc,
      securityGroup: database.clientSecurityGroup,
      environment: {
        APP_NAME: 'GymTracker',
        APP_ENV: 'production',
        APP_DEBUG: 'false',
        APP_KEY: appKey.valueAsString,
        APP_LOCALE: 'es',
        APP_USER_TIMEZONE: 'America/Santiago',
        LOG_CHANNEL: 'stderr',
        LOG_LEVEL: 'warning',
        DB_CONNECTION: 'pgsql',
        DB_HOST: database.cluster.clusterEndpoint.hostname,
        DB_PORT: '5432',
        DB_DATABASE: DB_NAME,
        DB_USERNAME: DB_USER,
        DB_PASSWORD: dbPassword.valueAsString,
        DB_SSLMODE: 'require',
        SESSION_DRIVER: 'database',
        SESSION_SECURE_COOKIE: 'true',
        CACHE_STORE: 'database',
        QUEUE_CONNECTION: 'sync',
      },
    });

    new WarmUp(this, 'WarmUp', { target: backend.artisan, schedule: props.warmUp });
  }
}
