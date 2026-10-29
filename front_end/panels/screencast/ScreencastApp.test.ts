// Copyright 2022 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import type * as Protocol from '../../generated/protocol.js';
import {renderElementIntoDOM} from '../../testing/DOMHelpers.js';
import {createTarget} from '../../testing/EnvironmentHelpers.js';
import {expectCall} from '../../testing/ExpectStubCall.js';
import {describeWithMockConnection, setMockConnectionResponseHandler} from '../../testing/MockConnection.js';
import * as UI from '../../ui/legacy/legacy.js';

import * as Screencast from './screencast.js';

describeWithMockConnection('ScreencastApp', () => {
  beforeEach(() => {
    const styles = document.createElement('style');
    styles.textContent = UI.inspectorCommonStyles;
    renderElementIntoDOM(styles);
  });

  afterEach(() => {
    Common.Settings.Settings.instance().createSetting('screencast-enabled', true).set(true);
  });

  it('keeps Runtime unsubscribed until the inspector is opened', () => {
    const enable = sinon.stub().returns({});
    const disable = sinon.stub().returns({});
    setMockConnectionResponseHandler('Runtime.enable', enable);
    setMockConnectionResponseHandler('Runtime.disable', disable);
    const app = new Screencast.ScreencastApp.ScreencastApp();
    app.presentUI(document);
    createTarget();
    sinon.assert.notCalled(enable);

    app.toggleInspectorView();
    sinon.assert.calledOnce(enable);

    app.toggleInspectorView();
    sinon.assert.calledOnce(disable);
    createTarget();
    sinon.assert.calledOnce(enable);
    app.rootView?.detach();
  });

  it('enables Runtime when screencasting is disabled and the inspector is visible', () => {
    const enable = sinon.stub().returns({});
    setMockConnectionResponseHandler('Runtime.enable', enable);
    const app = new Screencast.ScreencastApp.ScreencastApp();
    app.presentUI(document);
    createTarget();
    app.toggleButton.setToggled(false);
    app.toggleButton.dispatchEventToListeners(UI.Toolbar.ToolbarButton.Events.CLICK, new Event('click'));

    sinon.assert.calledOnce(enable);
    app.rootView?.detach();
  });

  it('keeps Runtime unsubscribed while the screencast target is replaced', () => {
    const enable = sinon.stub().returns({});
    setMockConnectionResponseHandler('Runtime.enable', enable);
    const app = new Screencast.ScreencastApp.ScreencastApp();
    app.presentUI(document);
    const target = createTarget();
    const model = target.model(SDK.ScreenCaptureModel.ScreenCaptureModel);
    assert.exists(model);

    app.modelRemoved(model);
    createTarget({id: 'replacement' as Protocol.Target.TargetID});

    sinon.assert.notCalled(enable);
    app.rootView?.detach();
  });

  it('can start casting', async () => {
    const screencastApp = new Screencast.ScreencastApp.ScreencastApp();
    screencastApp.presentUI(document);
    const tabTarget = createTarget({type: SDK.Target.Type.TAB});
    createTarget({parentTarget: tabTarget, subtype: 'prerender'});
    const target = createTarget({parentTarget: tabTarget});
    const screenCaptureModel = target.model(SDK.ScreenCaptureModel.ScreenCaptureModel);
    assert.exists(screenCaptureModel);
    await expectCall(sinon.stub(screenCaptureModel, 'startScreencast'));
    screencastApp.rootView?.detach();
  });
});
