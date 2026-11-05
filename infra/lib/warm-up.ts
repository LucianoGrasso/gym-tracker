import { TimeZone } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as targets from 'aws-cdk-lib/aws-scheduler-targets';
import { Construct } from 'constructs';

export interface WarmUpSchedule {
  readonly minute: string;
  readonly hour: string;
  readonly weekDay: string;
}

export interface WarmUpProps {
  /** Función de consola de Bref; recibe el comando artisan como string JSON. */
  readonly target: lambda.IFunction;
  readonly schedule: WarmUpSchedule;
}

/** Despierta Aurora un rato antes de entrenar para no esperar los ~15 s al abrir la app. */
export class WarmUp extends Construct {
  constructor(scope: Construct, id: string, props: WarmUpProps) {
    super(scope, id);

    new scheduler.Schedule(this, 'Schedule', {
      description: 'Despierta Aurora antes de ir al gimnasio',
      schedule: scheduler.ScheduleExpression.cron({ ...props.schedule, timeZone: TimeZone.AMERICA_SANTIAGO }),
      target: new targets.LambdaInvoke(props.target, {
        input: scheduler.ScheduleTargetInput.fromObject('app:wake-db'),
        retryAttempts: 0,
      }),
    });
  }
}
