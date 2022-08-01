/* eslint-disable @typescript-eslint/naming-convention */

import { ArrayItem, RegisterExtension } from "../BaseLoader";
import type { GLEFLoader } from "../glEFLoader";
import type { IGLEFLoaderExtension } from "../glEFLoaderExtension";
import { EventTrigger } from "core/Actions/VSM/Triggers/EventTrigger";
import { TapTrigger } from "core/Actions/VSM/Triggers/TapTrigger";
import { SpinAction } from "core/Actions/VSM/Actions/SpinAction";
import { RotateAction } from "core/Actions/VSM/Actions/RotateAction";
import { AimAction } from "core/Actions/VSM/Actions/AimAction";
import { TranslateAction } from "core/Actions/VSM/Actions/TranslateAction";
import { ShowAction } from "core/Actions/VSM/Actions/ShowAction";
import { HideAction } from "core/Actions/VSM/Actions/HideAction";
import { RaiseEventAction } from "core/Actions/VSM/Actions/RaiseEventAction";
import { NullAction } from "core/Actions/VSM/Actions/NullAction";
import { Animation } from "core/Animations/animation";

import { EasingFunction, QuadraticEase } from "core/Animations/easing";
import { Quaternion, Vector3 } from "core/Maths/math.vector";
import type { IActionOptions } from "core/Actions/VSM/Actions/BaseAction";

const NAME = "KHR_interactivity";

interface IKHRInteractivity {
    actions: any[];
    behaviors: any[];
    triggers: any[];
    references: any[];
}

/*
List of TODOs:

1) count on assets should be taken into account
2) What is the default mode for behavior? - "ignore"
3) What is "`animation`", where is it defined?
*/

/**
 * [Specification](NOT_YET_AVAILABLE)
 */
export class KHR_Interactivity implements IGLEFLoaderExtension {
    /**
     * The name of this extension.
     */
    public readonly name = NAME;

    /**
     * Defines whether this extension is enabled.
     */
    public enabled: boolean;

    private _loader: GLEFLoader;
    private _behaviors: any[];
    private _triggers: any[];
    private _actions: any[];
    private _references: any[];

    /**
     * @param loader
     * @hidden
     */
    constructor(loader: GLEFLoader) {
        this._loader = loader;
        this.enabled = this._loader.isExtensionUsed(NAME);
        console.log("KHR_interactivity_behavior: enabled", this.enabled);
    }

    /** @hidden */
    public dispose() {
        (this._loader as any) = null;
    }

    /** @hidden */
    public onLoading(): void {
        const extensions = this._loader.json.extensions;
        if (extensions && extensions[this.name]) {
            const extension = extensions[this.name] as IKHRInteractivity;
            ArrayItem.Assign(extension.actions);
            // TODO - discuss this with gary - is this always needed?
            // ArrayItem.Assign(this._references);
            ArrayItem.Assign(extension.behaviors);
            ArrayItem.Assign(extension.triggers);

            this._actions = extension.actions;
            this._behaviors = extension.behaviors;
            this._triggers = extension.triggers;
            this._references = extension.references;
        }
    }

    /** @hidden */
    public onReady(): void {
        this._loadInteractivityAsync();
    }

    private _loadInteractivityAsync(): void {
        // analyze the behaviors array and process everything there. The rest are all passive until needed.
        console.log("KHR_interactivity_behavior: loadInteractivityAsync");
        // generate all actions
        const actions = this._actions?.map((action) => {
            // it is possible this action was already created
            return this._processAction(action);
        });
        // generate all triggers
        const triggers = this._triggers?.map((trigger) => {
            trigger._babylonTrigger = this._generateTrigger(trigger);
            return trigger._babylonTrigger;
        });
        // connect all actions to triggers
        this._behaviors?.forEach((behavior) => {
            const trigger = (triggers || [])[behavior.trigger];
            const action = (actions || [])[behavior.action];
            if (trigger && action) {
                behavior._babylonBehavior = this._loader._behaviorManager.addBehavior(trigger, action);
            }
        });
    }

    private _generateTrigger(triggerData: { type: string; index: number; parameters?: { subject?: number;[key: string]: any } }) {
        // optional subject for some triggers
        const subject = this._getSubjectForData(triggerData.parameters?.subject);
        // TODO handle the other triggers
        switch (triggerData.type) {
            case "sceneStart":
                return new EventTrigger({
                    eventName: "sceneStart",
                });
            case "tap":
                return new TapTrigger({
                    subject,
                });
            case "event":
                return new EventTrigger({
                    eventName: triggerData.parameters?.event,
                });
        }
        return null;
    }

    private _generateAction(actionData: { type: string; parameters?: { subject?: number;[key: string]: any }; next?: number; parallel?: number }) {
        const subject = this._getSubjectForData(actionData.parameters?.subject);
        const options: IActionOptions = {
            playCount: actionData.parameters?.playCount,
            repeatUntilStopped: !actionData.parameters?.playCount,
            delay: actionData.parameters?.delay,
            customEventManager: this._loader._behaviorManager.customEventManager,
            separateParallelExecution: true,
        };
        // TODO handle the other action types
        switch (actionData.type) {
            case "group":
                return new NullAction({
                    ...options,
                    separateParallelExecution: false,
                    repeatUntilStopped: false,
                });
            case "spin":
                return new SpinAction({
                    subject,
                    ...options,
                });
            case "rotate":
                return new RotateAction({
                    subject,
                    rotationQuaternion: Quaternion.FromArray(actionData.parameters?.rotation),
                    duration: actionData.parameters?.duration !== undefined ? actionData.parameters?.duration * 1000 : undefined,
                    ...options,
                });
            case "move":
                return new TranslateAction({
                    subject,
                    translation: Vector3.FromArray(actionData.parameters?.direction),
                    duration: actionData.parameters?.duration !== undefined ? actionData.parameters?.duration * 1000 : undefined,
                    ...options,
                    repeatUntilStopped: false,
                });
            case "raiseEvent":
                return new RaiseEventAction({
                    eventName: actionData.parameters?.event,
                    ...options,
                    repeatUntilStopped: false,
                });
            case "aim": {
                return new AimAction({
                    subject,
                    target: this._getSubjectForData(actionData.parameters?.target),
                    duration: actionData.parameters?.duration !== undefined ? actionData.parameters?.duration * 1000 : undefined,
                    ...options,
                    repeatUntilStopped: actionData.parameters?.duration === undefined,
                });
            }
            case "hide":
            case "show": {
                // calculate "fps" with duration
                const fps = 100;
                // for now, create the animation here until the architecture change
                let animation: Animation | undefined = undefined;
                // no animation when it is 0 or undefined
                if (actionData.parameters?.showHideEffect) {
                    // support scaling/fading
                    // TODO extract this to an external, reusable function

                    // scaling
                    if (actionData.parameters?.showHideEffect === 2) {
                        animation = new Animation(`gltf-${subject.name}-${actionData.type}`, "scaling", fps, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CONSTANT);
                        animation.setKeys([
                            {
                                frame: 0,
                                value: actionData.type === "hide" ? subject.scaling.clone() : new Vector3(0, 0, 0),
                            },
                            {
                                frame: fps,
                                value: actionData.type === "show" ? subject.scaling.clone() : new Vector3(0, 0, 0),
                            },
                        ]);
                    } else if (actionData.parameters?.showHideEffect === 1) {
                        animation = new Animation(
                            `gltf-${subject.name}-${actionData.type}`,
                            "visibility",
                            fps,
                            Animation.ANIMATIONTYPE_FLOAT,
                            Animation.ANIMATIONLOOPMODE_CONSTANT
                        );
                        animation.setKeys([
                            {
                                frame: 0,
                                value: actionData.type === "hide" ? 1 : 0,
                            },
                            {
                                frame: fps,
                                value: actionData.type === "show" ? 1 : 0,
                            },
                        ]);
                    } else {
                        throw new Error("unknown animation type");
                    }

                    // Set easing. TODO - move it out to a private function
                    if (actionData.parameters.easing) {
                        const easing = new QuadraticEase();
                        switch (actionData.parameters.easing) {
                            case 3:
                                easing.setEasingMode(EasingFunction.EASINGMODE_EASEIN);
                                break;
                            case 2:
                                easing.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);
                                break;
                            case 1:
                                easing.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
                                break;
                        }
                        animation.setEasingFunction(easing);
                    }
                }
                return actionData.type === "hide"
                    ? new HideAction({
                        subject,
                        hideAnimation: animation,
                        duration: actionData.parameters?.duration !== undefined ? actionData.parameters?.duration * 1000 : undefined,
                        applyAnimationToChildren: actionData.parameters?.showHideEffect === 1 ? true : false,
                        ...options,
                        repeatUntilStopped: false,
                    })
                    : new ShowAction({
                        subject,
                        animation,
                        duration: actionData.parameters?.duration !== undefined ? actionData.parameters?.duration * 1000 : undefined,
                        applyAnimationToChildren: actionData.parameters?.showHideEffect === 1 ? true : false,
                        ...options,
                        repeatUntilStopped: false,
                    });
            }
        }
        return null;
    }

    private _processAction(actionData: { type: string; parameters?: { subject?: number; children?: number[]; child?: number }; next?: number; parallel?: number; _babylonAction?: any }) {
        if (!actionData._babylonAction) {
            const actionForData = this._generateAction(actionData);
            actionData._babylonAction = actionForData;
            if (actionForData) {
                if (typeof actionData.next === "number") {
                    const nextAction = this._processAction(ArrayItem.Get(`actions/${actionData.next}`, this._actions /* as IAction[]*/, actionData.next));
                    if (nextAction) {
                        actionForData.nextActions.push(nextAction);
                    }
                }
                if (typeof actionData.parallel === "number") {
                    const parallelAction = this._processAction(ArrayItem.Get(`actions/${actionData.parallel}`, this._actions /* as IAction[]*/, actionData.parallel));
                    if (parallelAction) {
                        actionForData.parallelActions.push(parallelAction);
                    }
                }
                // NOT ACCORDING TO SPECS! child is wrong
                if (actionData.parameters?.child) {
                    const nextAction = this._processAction(ArrayItem.Get(`actions/${actionData.parameters.child}`, this._actions /* as IAction[]*/, actionData.parameters.child));
                    if (nextAction) {
                        actionForData.nextActions.push(nextAction);
                    }
                }
                // According to specs, children is correct
                if (actionData.parameters?.children && actionData.parameters.children.length > 0) {
                    const nextAction = this._processAction(ArrayItem.Get(`actions/${actionData.parameters.children[0]}`, this._actions /* as IAction[]*/, actionData.parameters.children[0]));
                    if (nextAction) {
                        actionForData.nextActions.push(nextAction);
                    }
                }
            }
        }
        return actionData._babylonAction;
    }

    private _getSubjectForData(subject?: number) {
        if (typeof subject === "number") {
            const reference = this._references[subject];
            // TODO handle the different types
            switch (reference.type) {
                case "node":
                    return this._loader.json.nodes[reference.index]._babylonTransformNode;
            }
        }
        return null;
    }
}

RegisterExtension("glef", NAME, (loader) => new KHR_Interactivity(loader as GLEFLoader));
