import {Interfaces} from '../Interfaces';
import CommandInterface = Interfaces.CommandInterface;

export default (target: any, propertyKey: string, parameterIndex: number) => {
    const metadata: CommandInterface = Reflect.getOwnMetadata('command', target, propertyKey) || {};

    if (!Array.isArray(metadata.RemainderFields)) {
        metadata.RemainderFields = [];
    }

    metadata.RemainderFields.push(parameterIndex);

    Reflect.defineMetadata('command', metadata, target, propertyKey);
};
