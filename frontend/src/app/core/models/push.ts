export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface RestPushRequest {
  subscription: PushSubscriptionJson;
  signature: string;
  seconds: number;
  title: string;
  body: string;
  url: string;
}

export interface CancelPushRequest {
  endpoint: string;
  signature: string;
}

export type PushStatus = 'unsupported' | 'unasked' | 'on' | 'declined' | 'blocked';
