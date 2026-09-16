// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/** Probe the original endpoint before rebuilding the inspector's CDP models. */
export class InspectorReconnect {
  readonly #url: string;
  readonly #onReconnect: () => void;
  #timer: ReturnType<typeof setTimeout>|undefined;
  #socket: WebSocket|null = null;
  #attempts = 0;
  #stopped = false;

  constructor(url: string, onReconnect: () => void) {
    this.#url = url;
    this.#onReconnect = onReconnect;
  }

  schedule(): void {
    if (this.#stopped || this.#timer !== undefined || this.#socket || this.#attempts >= 8) {
      return;
    }
    const delay = Math.min(1000 * 2 ** this.#attempts, 15000);
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.#attempts++;
      this.#probe();
    }, delay);
  }

  stop(): void {
    this.#stopped = true;
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#closeSocket();
  }

  #closeSocket(): void {
    const socket = this.#socket;
    this.#socket = null;
    if (socket) {
      socket.onopen = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.close();
    }
  }

  #probe(): void {
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.#url);
    } catch {
      this.schedule();
      return;
    }
    this.#socket = socket;
    const failed = (): void => {
      if (this.#stopped || this.#socket !== socket) {
        return;
      }
      clearTimeout(this.#timer);
      this.#timer = undefined;
      this.#closeSocket();
      this.schedule();
    };
    socket.onopen = () => {
      if (this.#stopped || this.#socket !== socket) {
        return;
      }
      this.stop();
      // A new transport alone cannot restore CDP subscriptions or screencast.
      // Recreate the inspector, without reloading the inspected browser page.
      this.#onReconnect();
    };
    socket.onerror = failed;
    socket.onclose = failed;
    this.#timer = setTimeout(failed, 10000);
  }
}
