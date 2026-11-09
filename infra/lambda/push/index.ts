import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
  SchedulerClient,
  UpdateScheduleCommand,
  type CreateScheduleCommandInput,
} from '@aws-sdk/client-scheduler';
import { sendNotification, setVapidDetails } from 'web-push';
import { createHandler, type ScheduleInput } from './handler';

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable ${name}`);
  return value;
}

const client = new SchedulerClient({});
setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));

function toCommand(s: ScheduleInput): CreateScheduleCommandInput {
  return {
    Name: s.name,
    GroupName: s.group,
    ScheduleExpression: s.expression,
    ScheduleExpressionTimezone: 'UTC',
    FlexibleTimeWindow: { Mode: 'OFF' },
    ActionAfterCompletion: 'DELETE',
    // Un aviso atrasado no sirve: sin reintentos.
    Target: { Arn: s.targetArn, RoleArn: s.roleArn, Input: s.input, RetryPolicy: { MaximumRetryAttempts: 0 } },
  };
}

const errorName = (e: unknown) => (e as { name?: string }).name;

export const handler = createHandler({
  scheduler: {
    async upsert(schedule) {
      try {
        await client.send(new CreateScheduleCommand(toCommand(schedule)));
      } catch (e) {
        if (errorName(e) !== 'ConflictException') throw e;
        await client.send(new UpdateScheduleCommand(toCommand(schedule)));
      }
    },
    async remove(name, group) {
      try {
        await client.send(new DeleteScheduleCommand({ Name: name, GroupName: group }));
      } catch (e) {
        if (errorName(e) !== 'ResourceNotFoundException') throw e;
      }
    },
  },
  async sendPush(subscription, payload) {
    try {
      // TTL corto: si el teléfono no lo recibe en un minuto, ya no tiene sentido.
      await sendNotification(subscription, payload, { TTL: 60, urgency: 'high' });
      return 'sent';
    } catch (e) {
      const statusCode = (e as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) return 'gone';
      throw e;
    }
  },
  now: () => new Date(),
  config: {
    signingKey: env('PUSH_SIGNING_KEY'),
    group: env('SCHEDULE_GROUP'),
    roleArn: env('SCHEDULER_ROLE_ARN'),
    targetArn: env('TARGET_ARN'),
  },
});
