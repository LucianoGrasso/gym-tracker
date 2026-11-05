import { CfnParameter, SecretValue, Stack, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Database } from './database';

export interface WarmUpSchedule {
  readonly minute: string;
  readonly hour: string;
  readonly weekDay: string;
}

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
    void appKey; // se usa en la tarea 4
    void database; // se usa en la tarea 4
  }
}
