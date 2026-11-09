import { CfnOutput, CfnParameter, SecretValue, Stack, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Backend } from './backend';
import { DB_NAME, DB_USER, Database } from './database';
import { Frontend } from './frontend';
import { Push } from './push';
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
  /** Zonas fijas: así sintetizar no le pregunta nada a AWS (la CI no tiene credenciales). */
  override get availabilityZones(): string[] {
    return [`${this.region}a`, `${this.region}b`];
  }

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
    const pushSigningKey = new CfnParameter(this, 'PushSigningKey', {
      type: 'String',
      noEcho: true,
      minLength: 32,
      description: 'Clave HMAC con que Laravel firma las suscripciones push',
    });
    const vapidPrivateKey = new CfnParameter(this, 'VapidPrivateKey', {
      type: 'String',
      noEcho: true,
      description: 'Clave privada VAPID (Web Push)',
    });
    const vapidPublicKey = new CfnParameter(this, 'VapidPublicKey', {
      type: 'String',
      description: 'Clave pública VAPID (Web Push)',
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
        PUSH_SIGNING_KEY: pushSigningKey.valueAsString,
        PUSH_VAPID_PUBLIC_KEY: vapidPublicKey.valueAsString,
      },
    });

    new WarmUp(this, 'WarmUp', { target: backend.artisan, schedule: props.warmUp });

    const push = new Push(this, 'Push', {
      api: backend.api,
      signingKey: pushSigningKey.valueAsString,
      vapidPublicKey: vapidPublicKey.valueAsString,
      vapidPrivateKey: vapidPrivateKey.valueAsString,
    });

    // La HTTP API (el recurso) no depende de las Lambdas, sus rutas sí: no hay ciclo
    // Lambda → CloudFront → API → Lambda. Lo verifica test/frontend.test.ts.
    const frontend = new Frontend(this, 'Frontend', {
      distPath: props.frontendPath,
      apiDomain: `${backend.api.apiId}.execute-api.${this.region}.${this.urlSuffix}`,
    });
    const domain = frontend.distribution.distributionDomainName;
    for (const fn of [backend.http, backend.artisan]) {
      fn.addEnvironment('APP_URL', `https://${domain}`);
      fn.addEnvironment('SANCTUM_STATEFUL_DOMAINS', domain);
    }
    // Los servicios de push piden un contacto (mailto: o https:); usamos la URL de la app.
    push.fn.addEnvironment('VAPID_SUBJECT', `https://${domain}`);

    new CfnOutput(this, 'Url', { value: `https://${domain}`, description: 'URL pública de GymTracker' });
    new CfnOutput(this, 'ArtisanFunction', { value: backend.artisan.functionName });
  }
}
