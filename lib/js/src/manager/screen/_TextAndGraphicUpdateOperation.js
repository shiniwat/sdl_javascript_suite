/*
* Copyright (c) 2020, Livio, Inc.
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
* Neither the name of the Livio Inc. nor the names of its contributors
* may be used to endorse or promote products derived from this software
* without specific prior written permission.
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

import { _Task } from '../_Task';
import { Show } from '../../rpc/messages/Show';
import { ImageFieldName } from '../../rpc/enums/ImageFieldName';
import { _ManagerUtility } from '../_ManagerUtility';
import { MetadataTags } from '../../rpc/structs/MetadataTags';
import { TextFieldName } from '../../rpc/enums/TextFieldName';

class _TextAndGraphicUpdateOperation extends _Task {
    /**
     * Initializes an instance of _TextAndGraphicUpdateOperation
     * @param {_LifecycleManager} lifecycleManager - A _LifecycleManager instance
     * @param {FileManager} fileManager - A FileManager instance
     * @param {WindowCapability} currentCapabilities - The capabilities of the default main window
     * @param {Show} currentScreenData - The current state of the screen
     * @param {_TextAndGraphicState} newState - The updated state of the screen
     * @param {Function} listener - A method to be called when the task is completed
     * @param {Function} currentScreenDataUpdateListener - A method to update the current screen data
     */
    constructor (lifecycleManager, fileManager, currentCapabilities, currentScreenData, newState, listener, currentScreenDataUpdateListener) {
        super();
        this._lifecycleManager = lifecycleManager;
        this._fileManager = fileManager;
        this._defaultMainWindowCapability = currentCapabilities;
        this._currentScreenData = currentScreenData;
        this._updatedState = newState;
        this._listener = listener;
        this._currentScreenDataUpdateListener = currentScreenDataUpdateListener;
    }

    /**
     * The method that causes the task to run.
     * @param {_Task} task - The task instance
     */
    onExecute (task) {
        this._start();
    }
    /**
     * If the task is not canceled, starts to assemble the show
     */
    async _start () {
        if (this.getState() === _Task.CANCELED) {
            this._finishOperation(false);
            return;
        }
        let fullShow = new Show().setAlignment(this._updatedState.getTextAlignment());
        fullShow = this._assembleShowText(fullShow);
        fullShow = this._assembleShowImages(fullShow);

        if (!this._shouldUpdatePrimaryImage() && !this._shouldUpdateSecondaryImage()) {
            console.info('No images to send, sending text');
            const success = await this._sendShow(this._extractTextFromShow(fullShow));
            this._finishOperation(success);
        } else if (!this._sdlArtworkNeedsUpload(this._updatedState.getPrimaryGraphic()) &&
            !this._sdlArtworkNeedsUpload(this._updatedState.getSecondaryGraphic())) {
            console.info('Images already uploaded, sending full update');
            const success = await this._sendShow(fullShow);
            this._finishOperation(success);
        } else {
            console.info('Images need to be uploaded, sending text and uploading images');
            const success = await this._sendShow(this._extractTextFromShow(fullShow));
            if (this.getState() === _Task.CANCELED) {
                this._finishOperation(false);
                return;
            }
            await this._uploadImagesAndSendWhenDone();
            this._finishOperation(success);
        }
    }

    /**
     * Sends the Show RPC
     * @private
     * @param {Show} show - A Show RPC message.
     * @returns {Promise} - Resolves to a Boolean
     */
    async _sendShow (show) {
        const response = await this._lifecycleManager.sendRpcResolve(show);
        console.info('Text and Graphic update complete');
        if (response.getSuccess()) {
            this._updateCurrentScreenDataFromShow(show);
        }
        return response.getSuccess();
    }

    /**
     * Attempts to upload images and sends a show when finished
     */
    async _uploadImagesAndSendWhenDone () {
        const success = await this._uploadImages();
        const showWithGraphics = this._createImageOnlyShowWithPrimaryArtwork(this._updatedState.getPrimaryGraphic(), this._updatedState.getSecondaryGraphic());
        if (showWithGraphics !== null && showWithGraphics !== undefined) {
            console.info('Sending update with the successfully uploaded images');
            await this._sendShow(showWithGraphics);
            return success;
        } else {
            console.warn('All images failed to upload. No graphics to show, skipping update.');
            return false;
        }
    }

    /**
     * Uploads images that need to exist before sending a Show with images
     * @private
     * @returns {Promise} - returns true if succeeded, and false if failed
     */
    async _uploadImages () {
        const artworksToUpload = [];

        if (this._shouldUpdatePrimaryImage() && !this._updatedState.getPrimaryGraphic().isStaticIcon()) {
            artworksToUpload.push(this._updatedState.getPrimaryGraphic());
        }

        if (this._shouldUpdateSecondaryImage() && !this._updatedState.getSecondaryGraphic().isStaticIcon()) {
            artworksToUpload.push(this._updatedState.getSecondaryGraphic());
        }

        if (artworksToUpload.length === 0) {
            console.info('No artworks need an upload, sending them without upload instead');
            return true;
        }

        if (this._fileManager !== null && this._fileManager !== undefined) {
            const errors = await this._fileManager.uploadArtworks(artworksToUpload);
            if (this.getState() === _Task.CANCELED) {
                this._finishOperation(false);
                return;
            }
            if (errors.includes(false)) {
                console.error(`Text and graphic manager artwork failed to upload with error ${errors.toString()}`);
                return false;
            } else {
                return true;
            }
        }
    }

    /**
     * Sets the Show's image information
     * @private
     * @param {Show} show - A Show RPC Message.
     * @returns {Show} - The modified Show RPC Message.
     */
    _assembleShowImages (show) {
        if (this._shouldUpdatePrimaryImage()) {
            show.setGraphic(this._updatedState.getPrimaryGraphic().getImageRPC());
        }
        if (this._shouldUpdateSecondaryImage()) {
            show.setSecondaryGraphic(this._updatedState.getSecondaryGraphic().getImageRPC());
        }

        return show;
    }

    /**
     * Creates a show from images that need to be uploaded
     * @private
     * @param {SdlArtwork} primaryArtwork - The primary graphic
     * @param {SdlArtwork} secondaryArtwork - The secondary graphic
     */
    _createImageOnlyShowWithPrimaryArtwork (primaryArtwork, secondaryArtwork) {
        const newShow = new Show();
        newShow.setGraphic((primaryArtwork !== null && primaryArtwork !== undefined && !(this._sdlArtworkNeedsUpload(primaryArtwork))) ? primaryArtwork.getImageRPC() : null);
        newShow.setSecondaryGraphic((secondaryArtwork !== null && secondaryArtwork !== undefined && !(this._sdlArtworkNeedsUpload(secondaryArtwork))) ? secondaryArtwork.getImageRPC() : null);
        if ((newShow.getGraphic() === null || newShow.getGraphic() === undefined) && (newShow.getSecondaryGraphic() === null || newShow.getSecondaryGraphic() === undefined)) {
            console.info('No graphics to upload');
            return null;
        }
        return newShow;
    }

    /**
     * Sets the Show's text information
     * @private
     * @param {Show} show - A Show RPC Message.
     * @returns {Show} - The modified Show RPC Message.
     */
    _assembleShowText (show) {
        show = this._setBlankTextFields(show);

        if (this._updatedState.getMediaTrackTextField() !== null && this._updatedState.getMediaTrackTextField() !== undefined && this._shouldUpdateMediaTrackField()) {
            show.setMediaTrack(this._updatedState.getMediaTrackTextField());
        }

        if (this._updatedState.getTitle() !== null && this._updatedState.getTitle() !== undefined && this._shouldUpdateTitleField()) {
            show.setTemplateTitle(this._updatedState.getTitle());
        }

        const nonNullFields = this._findValidMainTextFields();
        if (nonNullFields.length === 0) {
            return show;
        }

        const numberOfLines = (this._defaultMainWindowCapability !== null && this._defaultMainWindowCapability !== undefined) ? _ManagerUtility.getMaxNumberOfMainFieldLines(this._defaultMainWindowCapability) : 4;
        switch (numberOfLines) {
            case 1:
                show = this._assembleOneLineShowText(show, nonNullFields);
                break;
            case 2:
                show = this._assembleTwoLineShowText(show);
                break;
            case 3:
                show = this._assembleThreeLineShowText(show);
                break;
            case 4:
                show = this._assembleFourLineShowText(show);
                break;
        }
        return show;
    }

    /**
     * Used for a head unit with one line available
     * @private
     * @param {Show} show - A Show RPC Message.
     * @param {String[]} showFields - An array of strings.
     * @returns {Show} - The modified Show RPC Message.
     */
    _assembleOneLineShowText (show, showFields) {
        let showString1 = '';
        for (let index = 0; index < showFields.length; index++) {
            if (index > 0) {
                showString1 = `${showString1} - ${showFields[index]}`;
            } else {
                showString1 = showString1 + showFields[index];
            }
        }
        show.setMainField1(showString1);
        const tags = new MetadataTags();
        tags.setMainField1(this._findNonNullMetadataFields());
        show.setMetadataTags(tags);

        return show;
    }

    /**
     * Used for a head unit with two lines available
     * @private
     * @param {Show} show - A Show RPC Message.
     * @returns {Show} - The modified Show RPC Message.
     */
    _assembleTwoLineShowText (show) {
        let tempString = '';
        const tags = new MetadataTags();

        if (this._updatedState.getTextField1() !== null && this._updatedState.getTextField1() !== undefined && this._updatedState.getTextField1().length > 0) {
            tempString = tempString + this._updatedState.getTextField1();
            if (this._updatedState.getTextField1Type() !== null && this._updatedState.getTextField1Type() !== undefined) {
                tags.setMainField1(this._updatedState.getTextField1Type());
            }
        }

        if (this._updatedState.getTextField2() !== null && this._updatedState.getTextField2() !== undefined && this._updatedState.getTextField2().length > 0) {
            if ((this._updatedState.getTextField3() === null || this._updatedState.getTextField3() === undefined || !(this._updatedState.getTextField3().length > 0)) && (this._updatedState.getTextField4() === null || this._updatedState.getTextField4() === undefined || !(this._updatedState.getTextField4().length > 0))) {
                // text does not exist in slots 3 or 4, put text2 in slot 2
                show.setMainField2(this._updatedState.getTextField2());
                if (this._updatedState.getTextField2Type() !== null && this._updatedState.getTextField2Type() !== undefined) {
                    tags.setMainField2(this._updatedState.getTextField2Type());
                }
            } else if (this._updatedState.getTextField1() !== null && this._updatedState.getTextField1() !== undefined && this._updatedState.getTextField1().length > 0) {
                // If text 1 exists, put it in slot 1 formatted
                tempString = `${tempString} - ${this._updatedState.getTextField2()}`;
                if (this._updatedState.getTextField2Type() !== null && this._updatedState.getTextField2Type() !== undefined) {
                    const typeList = [];
                    typeList.push(this._updatedState.getTextField2Type());
                    if (this._updatedState.getTextField1Type() !== null && this._updatedState.getTextField1Type() !== undefined) {
                        typeList.push(this._updatedState.getTextField1Type());
                    }
                    tags.setMainField1(typeList);
                }
            } else {
                // If text 1 does not exist, put it in slot 1 unformatted
                tempString = tempString + this._updatedState.getTextField2();
                if (this._updatedState.getTextField2Type() !== null && this._updatedState.getTextField2Type() !== undefined) {
                    tags.setMainField1(this._updatedState.getTextField2Type());
                }
            }
        }

        // set mainField1
        show.setMainField1(tempString);

        // new stringBuilder object
        tempString = '';

        if (this._updatedState.getTextField3() !== null && this._updatedState.getTextField3() !== undefined && this._updatedState.getTextField3().length > 0) {
            // If text 3 exists, put it in slot 2
            tempString = tempString + this._updatedState.getTextField3();
            if (this._updatedState.getTextField3Type() !== null && this._updatedState.getTextField3Type() !== undefined) {
                const typeList = [];
                typeList.push(this._updatedState.getTextField3Type());
                tags.setMainField2(typeList);
            }
        }

        if (this._updatedState.getTextField4() !== null && this._updatedState.getTextField4() !== undefined && this._updatedState.getTextField4().length > 0) {
            if (this._updatedState.getTextField3() !== null && this._updatedState.getTextField3() !== undefined && this._updatedState.getTextField3().length > 0) {
                // If text 3 exists, put it in slot 2 formatted
                tempString = `${tempString} - ${this._updatedState.getTextField4()}`;
                if (this._updatedState.getTextField4Type() !== null && this._updatedState.getTextField4Type() !== undefined) {
                    const typeList = [];
                    typeList.push(this._updatedState.getTextField4Type());
                    if (this._updatedState.getTextField3Type() !== null && this._updatedState.getTextField3Type() !== undefined) {
                        typeList.add(this._updatedState.getTextField3Type());
                    }
                    tags.setMainField2(typeList);
                }
            } else {
                // If text 3 does not exist, put it in slot 3 unformatted
                tempString = tempString + this._updatedState.getTextField4();
                if (this._updatedState.getTextField4Type() !== null && this._updatedState.getTextField4Type() !== undefined) {
                    tags.setMainField2(this._updatedState.getTextField4Type());
                }
            }
        }

        if (tempString.length > 0) {
            show.setMainField2(tempString.toString());
        }

        show.setMetadataTags(tags);
        return show;
    }

    /**
     * Used for a head unit with three lines available
     * @private
     * @param {Show} show - A Show RPC Message.
     * @returns {Show} - The modified Show RPC Message.
     */
    _assembleThreeLineShowText (show) {
        const tags = new MetadataTags();

        if (this._updatedState.getTextField1() !== null && this._updatedState.getTextField1() !== undefined && this._updatedState.getTextField1().length > 0) {
            show.setMainField1(this._updatedState.getTextField1());
            if (this._updatedState.getTextField1Type() !== null && this._updatedState.getTextField1Type() !== undefined) {
                tags.setMainField1(this._updatedState.getTextField1Type());
            }
        }

        if (this._updatedState.getTextField2() !== null && this._updatedState.getTextField2() !== undefined && this._updatedState.getTextField2().length > 0) {
            show.setMainField2(this._updatedState.getTextField2());
            if (this._updatedState.getTextField2Type() !== null && this._updatedState.getTextField2Type() !== undefined) {
                tags.setMainField2(this._updatedState.getTextField2Type());
            }
        }

        let tempString = '';

        if (this._updatedState.getTextField3() !== null && this._updatedState.getTextField3() !== undefined && this._updatedState.getTextField3().length > 0) {
            tempString.append(this._updatedState.getTextField3());
            if (this._updatedState.getTextField3Type() !== null && this._updatedState.getTextField3Type() !== undefined) {
                tags.setMainField3(this._updatedState.getTextField3Type());
            }
        }

        if (this._updatedState.getTextField4() !== null && this._updatedState.getTextField4() !== undefined && this._updatedState.getTextField4().length > 0) {
            if (this._updatedState.getTextField3() !== null && this._updatedState.getTextField3() !== undefined && this._updatedState.getTextField3().length > 0) {
                // If text 3 exists, put it in slot 3 formatted
                tempString = `${tempString}  - ${this._updatedState.getTextField4()}`;
                if (this._updatedState.getTextField4Type() !== null && this._updatedState.getTextField4Type() !== undefined) {
                    const tags4 = [];
                    if (this._updatedState.getTextField3Type() !== null && this._updatedState.getTextField3Type() !== undefined) {
                        tags4.push(this._updatedState.getTextField3Type());
                    }
                    tags4.push(this._updatedState.getTextField4Type());
                    tags.setMainField3(tags4);
                }
            } else {
                // If text 3 does not exist, put it in slot 3 formatted
                tempString = tempString + this._updatedState.getTextField4();
                if (this._updatedState.getTextField4Type() !== null && this._updatedState.getTextField4Type() !== undefined) {
                    tags.setMainField3(this._updatedState.getTextField4Type());
                }
            }
        }
        show.setMainField3(tempString);
        show.setMetadataTags(tags);
        return show;
    }

    /**
     * Used for a head unit with four lines available
     * @private
     * @param {Show} show - A Show RPC Message.
     * @returns {Show} - The modified Show RPC Message.
     */
    _assembleFourLineShowText (show) {
        const tags = new MetadataTags();
        if (this._updatedState.getTextField1() !== null && this._updatedState.getTextField1() !== undefined && this._updatedState.getTextField1().length > 0) {
            show.setMainField1(this._updatedState.getTextField1());
            if (this._updatedState.getTextField1Type() !== null) {
                tags.setMainField1(this._updatedState.getTextField1Type());
            }
        }

        if (this._updatedState.getTextField2() !== null && this._updatedState.getTextField2() !== undefined && this._updatedState.getTextField2().length > 0) {
            show.setMainField2(this._updatedState.getTextField2());
            if (this._updatedState.getTextField2Type() !== null) {
                tags.setMainField2(this._updatedState.getTextField2Type());
            }
        }

        if (this._updatedState.getTextField3() !== null && this._updatedState.getTextField3() !== undefined && this._updatedState.getTextField3().length > 0) {
            show.setMainField3(this._updatedState.getTextField3());
            if (this._updatedState.getTextField3Type() !== null && this._updatedState.getTextField3Type() !== undefined) {
                tags.setMainField3(this._updatedState.getTextField3Type());
            }
        }

        if (this._updatedState.getTextField4() !== null && this._updatedState.getTextField4() !== undefined && this._updatedState.getTextField4().length > 0) {
            show.setMainField4(this._updatedState.getTextField4());
            if (this._updatedState.getTextField4Type() !== null && this._updatedState.getTextField4Type() !== undefined) {
                tags.setMainField4(this._updatedState.getTextField4Type());
            }
        }

        show.setMetadataTags(tags);

        return show;
    }

    /**
     * Gets only text information and puts it into a new Show
     * @private
     * @param {Show} show - A Show RPC Message.
     * @returns {Show} - A new Show RPC Message.
     */
    _extractTextFromShow (show) {
        const newShow = new Show();
        newShow.setMainField1(show.getMainField1());
        newShow.setMainField2(show.getMainField2());
        newShow.setMainField3(show.getMainField3());
        newShow.setMainField4(show.getMainField4());
        newShow.setTemplateTitle(show.getTemplateTitle());
        newShow.setMetadataTags(show.getMetadataTags());
        newShow.setAlignment(show.getAlignment());

        return newShow;
    }

    /**
     * Clears out a Show's text fields
     *
     * @private
     * @param {Show} show - A Show RPC Message.
     * @returns {Show} - The modified Show RPC Message.
     */
    _setBlankTextFields (show) {
        show.setMainField1('');
        show.setMainField2('');
        show.setMainField3('');
        show.setMainField4('');
        show.setMediaTrack('');
        show.setTemplateTitle('');
        return show;
    }

    /**
     * Updates the local state to match what was sent
     * @private
     * @param {Show} show - A Show RPC Message.
     */
    _updateCurrentScreenDataFromShow (show) {
        if (show === null || show === undefined) {
            console.error('Can not updateCurrentScreenDataFromShow from null or undefined show');
            return;
        }

        // If the items are null, they were not updated, so we can't just set it directly
        if (show.getMainField1() !== null && show.getMainField1() !== undefined) {
            this._currentScreenData.setMainField1(show.getMainField1());
        }
        if (show.getMainField2() !== null && show.getMainField2() !== undefined) {
            this._currentScreenData.setMainField2(show.getMainField2());
        }
        if (show.getMainField3() !== null && show.getMainField3() !== undefined) {
            this._currentScreenData.setMainField3(show.getMainField3());
        }
        if (show.getMainField4() !== null && show.getMainField4() !== undefined) {
            this._currentScreenData.setMainField4(show.getMainField4());
        }
        if (show.getTemplateTitle() !== null && show.getTemplateTitle() !== undefined) {
            this._currentScreenData.setTemplateTitle(show.getTemplateTitle());
        }
        if (show.getMediaTrack() !== null && show.getMediaTrack() !== undefined) {
            this._currentScreenData.setMediaTrack(show.getMediaTrack());
        }
        if (show.getMetadataTags() !== null && show.getMetadataTags() !== undefined) {
            this._currentScreenData.setMetadataTags(show.getMetadataTags());
        }
        if (show.getAlignment() !== null && show.getAlignment() !== undefined) {
            this._currentScreenData.setAlignment(show.getAlignment());
        }
        if (show.getGraphic() !== null && show.getGraphic() !== undefined) {
            this._currentScreenData.setGraphic(show.getGraphic());
        }
        if (show.getSecondaryGraphic() !== null && show.getSecondaryGraphic() !== undefined) {
            this._currentScreenData.setSecondaryGraphic(show.getSecondaryGraphic());
        }
        if (this._currentScreenDataUpdateListener !== null && this._currentScreenDataUpdateListener !== undefined) {
            this._currentScreenDataUpdateListener(this._currentScreenData);
        }
    }

    /**
     * Returns only valid main text fields
     * @private
     * @returns {String[]} - An array of strings representing the Show's textFields
     */
    _findValidMainTextFields () {
        const array = [];

        if (this._updatedState.getTextField1() !== null && this._updatedState.getTextField1() !== undefined && this._updatedState.getTextField1().length > 0) {
            array.push(this._updatedState.getTextField1());
        }

        if (this._updatedState.getTextField2() !== null && this._updatedState.getTextField2() !== undefined && this._updatedState.getTextField2().length > 0) {
            array.push(this._updatedState.getTextField2());
        }

        if (this._updatedState.getTextField3() !== null && this._updatedState.getTextField3() !== undefined && this._updatedState.getTextField3().length > 0) {
            array.push(this._updatedState.getTextField3());
        }

        if (this._updatedState.getTextField4() !== null && this._updatedState.getTextField4() !== undefined && this._updatedState.getTextField4().length > 0) {
            array.push(this._updatedState.getTextField4());
        }

        return array;
    }

    /**
     * Returns only non-null metadata fields
     * @private
     * @returns {MetadataType[]} - An array of MetadataType, each item representing a textField.
     */
    _findNonNullMetadataFields () {
        const metadataArray = [];

        if (this._updatedState.getTextField1Type() !== null && this._updatedState.getTextField1Type() !== undefined) {
            metadataArray.push(this._updatedState.getTextField1Type());
        }

        if (this._updatedState.getTextField2Type() !== null && this._updatedState.getTextField2Type() !== undefined) {
            metadataArray.push(this._updatedState.getTextField2Type());
        }

        if (this._updatedState.getTextField3Type() !== null && this._updatedState.getTextField3Type() !== undefined) {
            metadataArray.push(this._updatedState.getTextField3Type());
        }

        if (this._updatedState.getTextField4Type() !== null && this._updatedState.getTextField4Type() !== undefined) {
            metadataArray.push(this._updatedState.getTextField4Type());
        }

        return metadataArray;
    }

    /**
     * Checks whether the passed in artwork needs to be sent out
     * @private
     * @param {SdlArtwork} artwork - An instance of SdlArtwork.
     * @returns {Boolean} - Whether or not the artwork needs to be uploaded.
     */
    _sdlArtworkNeedsUpload (artwork) {
        if (this._fileManager !== null && this._fileManager !== undefined) {
            return artwork !== null && artwork !== undefined && !this._fileManager.hasUploadedFile(artwork) && !artwork.isStaticIcon();
        }
        return false;
    }

    /**
     * Checks whether the primary image should be sent out
     * @private
     * @returns {Boolean} - Whether or not the primary image needs to be uploaded.
     */
    _shouldUpdatePrimaryImage () {
        const templateSupportsPrimaryArtwork = this._templateSupportsImageField(ImageFieldName.graphic);
        const currentScreenDataPrimaryGraphicName = (this._currentScreenData !== null && this._currentScreenData !== undefined && this._currentScreenData.getGraphic() !== null && this._currentScreenData.getGraphic() !== undefined) ? this._currentScreenData.getGraphic().getValue() : null;
        const primaryGraphicName = (this._updatedState.getPrimaryGraphic() !== null && this._updatedState.getPrimaryGraphic() !== undefined) ? this._updatedState.getPrimaryGraphic().getName() : null;

        const graphicMatchesExisting = currentScreenDataPrimaryGraphicName === primaryGraphicName;

        return templateSupportsPrimaryArtwork && !graphicMatchesExisting;
    }

    /**
     * Checks whether the secondary image should be sent out
     * @private
     * @returns {Boolean} - Whether or not the secondary image needs to be uploaded.
     */
    _shouldUpdateSecondaryImage () {
        const templateSupportsSecondaryArtwork = this._templateSupportsImageField(ImageFieldName.secondaryGraphic);
        const currentScreenDataSecondaryGraphicName = (this._currentScreenData !== null && this._currentScreenData !== undefined && this._currentScreenData.getSecondaryGraphic() !== null && this._currentScreenData.getSecondaryGraphic() !== undefined) ? this._currentScreenData.getSecondaryGraphic().getValue() : null;
        const secondaryGraphicName = (this._updatedState.getSecondaryGraphic() !== null && this._updatedState.getSecondaryGraphic() !== undefined) ? this._updatedState.getSecondaryGraphic().getName() : null;

        const graphicMatchesExisting = currentScreenDataSecondaryGraphicName === secondaryGraphicName;

        // Cannot detect if there is a secondary image below v5.0, so we'll just try to detect if the primary image is allowed and allow the secondary image if it is.
        if (this._lifecycleManager.getSdlMsgVersion().getMajorVersion() >= 5) {
            return templateSupportsSecondaryArtwork && !graphicMatchesExisting;
        } else {
            return this._templateSupportsImageField(ImageFieldName.graphic) && !graphicMatchesExisting;
        }
    }

    /**
     * Check to see if template supports the specified image field
     * @private
     * @param {ImageFieldName} name - The image field name to check
     * @returns {Boolean} - True if image field is supported, false if not
     */
    _templateSupportsImageField (name) {
        return this._defaultMainWindowCapability === null || this._defaultMainWindowCapability === undefined || _ManagerUtility.hasImageFieldOfName(this._defaultMainWindowCapability, name);
    }

    /**
     * Check to see if mediaTrackTextField should be updated
     * @private
     * @returns {Boolean} - True if mediaTrackTextField should be updated, false if not
     */
    _shouldUpdateMediaTrackField () {
        return this._templateSupportsTextField(TextFieldName.mediaTrack);
    }

    /**
     * Check to see if title should be updated
     * @private
     * @returns {Boolean} - True if title should be updated, false if not
     */
    _shouldUpdateTitleField () {
        return  this._templateSupportsTextField(TextFieldName.templateTitle);
    }

    /**
     * Check to see if template supports the specified text field
     * @private
     * @param {TextFieldName} name - The text field name to check
     * @returns {Boolean} - True if text field is supported, false if not
     */
    _templateSupportsTextField (name) {
        return this._defaultMainWindowCapability === null || this._defaultMainWindowCapability === undefined || _ManagerUtility.hasTextFieldOfName(this._defaultMainWindowCapability, name);
    }

    /**
     * Return the current screen data
     * @private
     */
    _getCurrentScreenData () {
        return this._currentScreenData;
    }

    /**
     * Set the current screen data
     * @private
     * @param {Show} show 
     */
    _setCurrentScreenData (show) {
        this._currentScreenData = show;
    }

    /**
     * Method to be called once the task has completed
     * @private
     * @param {Boolean} success 
     */
    _finishOperation (success) {
        console.info('Finishing text and graphic update operation');
        if (this._listener !== null && this._listener !== null) {
            this._listener(success);
        }
        this.onFinished();
    }
}

export { _TextAndGraphicUpdateOperation };