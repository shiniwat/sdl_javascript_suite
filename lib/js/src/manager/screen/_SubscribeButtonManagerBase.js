import { _SubManagerBase } from '../_SubManagerBase.js';
import { SubscribeButton } from '../../rpc/messages/SubscribeButton';
import { UnsubscribeButton } from '../../rpc/messages/UnsubscribeButton';
import { OnButtonPress } from '../../rpc/messages/OnButtonPress';
import { OnButtonEvent } from '../../rpc/messages/OnButtonEvent';
import { FunctionID } from '../../rpc/enums/FunctionID';
import { _ArrayTools } from '../../util/_ArrayTools';

class _SubscribeButtonManagerBase extends _SubManagerBase {
    constructor (lifecycleManager) {
        super(lifecycleManager);
        this.setRpcNotificationListeners();
        this._onButtonListeners = new Map();
    }

    async start () {
        this._transitionToState(_SubManagerBase.READY);
        await super.start();
    }

    dispose () {
        super.dispose();
        if (this._onButtonListeners !== null) {
            this._onButtonListeners.clear();
        }
        this._lifecycleManager.removeRpcListener(FunctionID.OnButtonPress, this._onButtonPressListener);
        this._lifecycleManager.removeRpcListener(FunctionID.onButtonEvent, this._onButtonEventListener);
    }

    async _addButtonListener (buttonName, listener) {
        if (listener === null || listener === undefined || buttonName === null || buttonName === undefined) {
            // error, look into how the other managers handle this
            return this;
        }

        //if (this._onButtonListeners.get(buttonName) === null || this._onButtonListeners.get(buttonName) === undefined) {
            await this._subscribeButtonRequest(buttonName, listener);
        //}
        return this;
    }

    async _removeButtonListener (buttonName, listener) {
        if (listener === null || listener === undefined || buttonName === null || buttonName === undefined) {
            // error, look into how the other managers handle this
            return this;
        }

        if (this._onButtonListeners.get(buttonName) === null || this._onButtonListeners === undefined || !this._onButtonListeners.get(buttonName).includes(listener)) {
            return this;
        }
        await this._unsubscribeButtonRequest(buttonName, listener);
        return this;
    }

    async _subscribeButtonRequest (buttonName, listener) {
        const subscribeButton = new SubscribeButton().setButtonName(buttonName);
        const response = await this._lifecycleManager.sendRpcResolve(subscribeButton);

        if (response.getSuccess()) {
            console.log('subscribed to ', buttonName);
            let listenerArray = this._onButtonListeners.get(buttonName);
            // If no array exists yet for this function id, create one
            if (!Array.isArray(listenerArray)) {
                listenerArray = [];
            }
            listenerArray.push(listener);
            this._onButtonListeners.set(buttonName, listenerArray);
        }
        return this;
        // error
    }

    async _unsubscribeButtonRequest (buttonName, listener) {
        const unsubscribeButton = new UnsubscribeButton().setButtonName(buttonName);
        const response = await this._lifecycleManager.sendRpcResolve(unsubscribeButton);
        if (response.getSuccess()) {
            const listenerArray = this._onButtonListeners.get(buttonName);
            if (Array.isArray(listenerArray)) {
                this._onButtonListeners.set(buttonName, _ArrayTools.arrayRemove(listenerArray, listener));
            }
        }
        return this;
        // error
    }

    _onButtonEventListener (onButtonEvent) {
        if (onButtonEvent instanceof OnButtonEvent) {
            console.log(this);
            const listeners = this._onButtonListeners.get(onButtonEvent.getButtonName());
            if (listeners !== null && listeners !== undefined && listeners.length > 0) {
                for (const listener of listeners) {
                    listener(onButtonEvent.getButtonName(), onButtonEvent);
                }
            }
        }
        return this;
    }

    getButtonListeners () {
        return this._onButtonListeners;
    }

    setRpcNotificationListeners () {

        const _onButtonPressListener = function (onButtonPress) {
            if (onButtonPress instanceof OnButtonPress) {
                console.log(getButtonListeners().size);
                const listeners = this._onButtonListeners.get(onButtonPress.getButtonName());
                if (listeners !== null && listeners !== undefined && listeners.length > 0) {
                    for (const listener of listeners) {
                        listener(onButtonPress.getButtonName(), onButtonPress);
                    }
                }
            }
            return this;
        }

        this._lifecycleManager.addRpcListener(FunctionID.OnButtonPress, _onButtonPressListener);
        //this._lifecycleManager.addRpcListener(FunctionID.OnButtonEvent, this._onButtonEventListener);
        return this;
    }
}

export { _SubscribeButtonManagerBase };