// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {assert} from 'chai';
import sinon from 'sinon';

// Keep the retry controller testable without initializing the entire DevTools UI.
// eslint-disable-next-line rulesdir/es-modules-import
import {InspectorReconnect} from './InspectorReconnect.js';

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void)|null = null;
  onclose: (() => void)|null = null;
  onerror: (() => void)|null = null;
  close = sinon.spy();
  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
}

describe('InspectorReconnect', () => {
  let clock: sinon.SinonFakeTimers;
  let reconnect: InspectorReconnect;
  let reload: sinon.SinonSpy;
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
    FakeSocket.instances = [];
    globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
    reload = sinon.spy();
    reconnect = new InspectorReconnect('wss://example.test/devtools/page/existing', reload);
  });

  afterEach(() => {
    reconnect.stop();
    clock.restore();
    globalThis.WebSocket = originalWebSocket;
  });

  it('coalesces disconnect notifications and reloads only after the same endpoint opens', () => {
    reconnect.schedule();
    reconnect.schedule();
    clock.tick(999);
    assert.lengthOf(FakeSocket.instances, 0);
    clock.tick(1);
    const socket = FakeSocket.instances[0];
    assert.strictEqual(socket.url, 'wss://example.test/devtools/page/existing');
    sinon.assert.notCalled(reload);
    socket.onopen?.();
    sinon.assert.calledOnce(socket.close);
    sinon.assert.calledOnce(reload);
    clock.tick(60000);
    assert.lengthOf(FakeSocket.instances, 1);
  });

  it('backs off after errors, closes failed probes, and ignores late callbacks', () => {
    reconnect.schedule();
    clock.tick(1000);
    const first = FakeSocket.instances[0];
    const staleOpen = first.onopen;
    const staleClose = first.onclose;
    first.onerror?.();
    sinon.assert.calledOnce(first.close);
    clock.tick(1999);
    assert.lengthOf(FakeSocket.instances, 1);
    clock.tick(1);
    staleOpen?.();
    staleClose?.();
    sinon.assert.notCalled(reload);
    const second = FakeSocket.instances[1];
    sinon.assert.notCalled(second.close);
    second.onopen?.();
    sinon.assert.calledOnce(reload);
  });

  it('times out stalled handshakes and stops after eight attempts for an unavailable session', () => {
    reconnect.schedule();
    clock.tick(300000);
    assert.lengthOf(FakeSocket.instances, 8);
    for (const socket of FakeSocket.instances) {
      sinon.assert.calledOnce(socket.close);
    }
    sinon.assert.notCalled(reload);
    reconnect.schedule();
    clock.tick(60000);
    assert.lengthOf(FakeSocket.instances, 8);
  });

  it('cancels a pending retry when the inspector leaves', () => {
    reconnect.schedule();
    reconnect.stop();
    clock.tick(60000);
    assert.lengthOf(FakeSocket.instances, 0);
  });

  it('closes an in-flight probe and ignores its late open after stop', () => {
    reconnect.schedule();
    clock.tick(1000);
    const socket = FakeSocket.instances[0];
    const open = socket.onopen;
    reconnect.stop();
    open?.();
    clock.tick(60000);
    sinon.assert.calledOnce(socket.close);
    sinon.assert.notCalled(reload);
    assert.lengthOf(FakeSocket.instances, 1);
  });

  it('retries close-before-open and synchronous constructor failures', () => {
    globalThis.WebSocket = function(): never {
      throw new Error('unavailable');
    } as unknown as typeof WebSocket;
    reconnect.schedule();
    clock.tick(1000);
    globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
    clock.tick(2000);
    FakeSocket.instances[0].onclose?.();
    clock.tick(4000);
    assert.lengthOf(FakeSocket.instances, 2);
    FakeSocket.instances[1].onopen?.();
    sinon.assert.calledOnce(reload);
  });
});
