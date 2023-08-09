import type { FlowGraphBlock } from "./flowGraphBlock";
import { FlowGraphConnection, FlowGraphConnectionType } from "./flowGraphConnection";

/**
 * @experimental
 * Represents a connection point for data.
 * An unconnected input point can have a default value.
 * An output point will only have a value if it is connected to an input point. Furthermore,
 * if the point belongs to a "function" node, the node will run its function to update the value.
 */
export class FlowGraphDataConnection<T> extends FlowGraphConnection<FlowGraphBlock, FlowGraphDataConnection<T>> {
    public constructor(name: string, type: FlowGraphConnectionType, ownerBlock: FlowGraphBlock, private _value: T) {
        super(name, type, ownerBlock);
    }

    /**
     * An output data block can connect to multiple input data blocks,
     * but an input data block can only connect to one output data block.
     */
    public _isSingularConnection(): boolean {
        return this.type === FlowGraphConnectionType.Input;
    }

    public set value(value: T) {
        this._value = value;
    }

    public get value(): T {
        if (this.type === FlowGraphConnectionType.Output) {
            this._ownerBlock._updateOutputs();
            return this._value;
        }

        if (!this.isConnected()) {
            return this._value;
        } else {
            return this._connectedPoint[0].value;
        }
    }
}
