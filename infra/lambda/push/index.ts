import { SFNClient, StartExecutionCommand, StopExecutionCommand } from '@aws-sdk/client-sfn';
import { sendNotification, setVapidDetails } from 'web-push';
import { createHandler } from './handler';

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable ${name}`);
  return value;
}

const client = new SFNClient({});
const stateMachineArn = env('STATE_MACHINE_ARN');
setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));

export const handler = createHandler({
  timer: {
    async start(name, input) {
      const out = await client.send(new StartExecutionCommand({ stateMachineArn, name, input }));
      if (!out.executionArn) throw new Error('Step Functions no devolvió el ARN de la ejecución');
      return out.executionArn;
    },
    async stop(executionArn) {
      await client.send(new StopExecutionCommand({ executionArn, cause: 'Descanso reemplazado o saltado' }));
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
  config: { signingKey: env('PUSH_SIGNING_KEY'), stateMachineArn },
});
