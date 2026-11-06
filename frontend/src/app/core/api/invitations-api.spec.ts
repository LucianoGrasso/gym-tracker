import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InvitationsApi } from './invitations-api';

describe('InvitationsApi', () => {
  let api: InvitationsApi;
  let mock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(InvitationsApi);
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  it('lists, creates and revokes invitations', async () => {
    const listed = api.list();
    mock.expectOne('/api/invitations').flush({ data: [{ id: 1, expires_at: 'x', expires_on: '2026-11-13' }] });
    expect((await listed)[0].id).toBe(1);

    const created = api.create();
    const post = mock.expectOne('/api/invitations');
    expect(post.request.method).toBe('POST');
    post.flush({ data: { id: 2, expires_at: 'x', expires_on: '2026-11-13', token: 'tok' } });
    expect((await created).token).toBe('tok');

    const revoked = api.revoke(2);
    const del = mock.expectOne('/api/invitations/2');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    await revoked;
  });

  it('previews an invitation by token', async () => {
    const preview = api.preview('a/b');
    mock.expectOne('/auth/invitations/a%2Fb').flush({ data: { inviter_name: 'Luciano', expires_at: 'x' } });
    expect((await preview).inviter_name).toBe('Luciano');
  });
});
