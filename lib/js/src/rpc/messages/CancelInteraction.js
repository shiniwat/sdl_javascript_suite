/* eslint-disable camelcase */
/*
* Copyright (c) 2020, SmartDeviceLink Consortium, Inc.
* All rights reserved.
*
* Redistribution and use in source and binary forms, with or without
* modification, are permitted provided that the following conditions are met:
*
* Redistributions of source code must retain the above copyright notice, this
* list of conditions and the following disclaimer.
*
* Redistributions in binary form must reproduce the above copyright notice,
* this list of conditions and the following
* disclaimer in the documentation and/or other materials provided with the
* distribution.
*
* Neither the name of the SmartDeviceLink Consortium Inc. nor the names of
* its contributors may be used to endorse or promote products derived
* from this software without specific prior written permission.
*
* THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
* AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
* IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
* ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
* LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
* CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
* SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
* INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
* CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
* ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
* POSSIBILITY OF SUCH DAMAGE.
*/

import { FunctionID } from '../enums/FunctionID.js';
import { RpcRequest } from '../RpcRequest.js';

/**
 * Close an active interaction on the HMI.
 */
class CancelInteraction extends RpcRequest {
    /**
     * Initalizes an instance of CancelInteraction.
     * @constructor
     */
    constructor (store) {
        super(store);
        this.setFunctionName(FunctionID.CancelInteraction);
    }

    /**
     * @param {Number} id - The ID of the specific interaction you want to dismiss. If not set, the most recent of the
     *                      RPC type set in functionID will be dismissed.
     * @return {CancelInteraction}
     */
    setCancelID (id) {
        this.setParameter(CancelInteraction.KEY_CANCEL_ID, id);
        return this;
    }

    /**
     * @return {Number}
     */
    getCancelID () {
        return this.getParameter(CancelInteraction.KEY_CANCEL_ID);
    }

    /**
     * @param {Number} id - The ID of the type of interaction the developer wants to dismiss. Only values 10,
     *                      (PerformInteractionID), 12 (AlertID), 25 (ScrollableMessageID), and 26 (SliderID) are
     *                      permitted.
     * @return {CancelInteraction}
     */
    setFunctionID (id) {
        this.setParameter(CancelInteraction.KEY_FUNCTION_ID, id);
        return this;
    }

    /**
     * @return {Number}
     */
    getFunctionID () {
        return this.getParameter(CancelInteraction.KEY_FUNCTION_ID);
    }
}

CancelInteraction.KEY_CANCEL_ID = 'cancelID';
CancelInteraction.KEY_FUNCTION_ID = 'functionID';

export { CancelInteraction };