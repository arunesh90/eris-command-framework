import {Client} from 'eris';
import {inject, injectable} from 'inversify';

import CommandContext from './CommandContext';
import CommandError from './CommandError';
import CommandInfo from './Info/CommandInfo';
import ParameterInfo from './Info/ParameterInfo';
import AbstractTypeReader from './Reader/AbstractTypeReader';
import ArrayTypeReader from './Reader/ArrayTypeReader';
import ChannelTypeReader from './Reader/ChannelTypeReader';
import DateTypeReader from './Reader/DateTypeReader';
import DurationTypeReader from './Reader/DurationTypeReader';
import EnumTypeReader from './Reader/EnumTypeReader';
import MemberTypeReader from './Reader/MemberTypeReader';
import PrimitiveTypeReader from './Reader/PrimitiveTypeReader';
import RoleTypeReader from './Reader/RoleTypeReader';
import UserTypeReader from './Reader/UserTypeReader';
import ParseResult from './Result/ParseResult';
import TypeReaderResult from './Result/TypeReaderResult';
import TypeReaderValue from './Result/TypeReaderValue';
import TYPES from './types';

enum ParserPart {
    None,
    Parameter,
    QuotedParameter,
}

@injectable()
export default class CommandParser {
    @inject(TYPES.DiscordClient)
    private client: Client;

    public async ParseAsync(context: CommandContext, command: CommandInfo, start: number): Promise<ParseResult> {
        let input: string                 = context.Message.content.substr(start);
        let curParam: ParameterInfo       = null;
        let argBuilder: string            = '';
        let endPos: number                = input.length;
        let curPart: ParserPart           = ParserPart.None;
        let lastArgEndPos: number         = -2147483648;
        let argList: TypeReaderResult[]   = [];
        let paramList: TypeReaderResult[] = [];
        let isEscaping: boolean           = false;
        let c: string                     = '';

        for (let curPos: number = 0; curPos <= endPos; curPos++) {
            if (curPos < endPos) {
                c = input[curPos];
            } else {
                c = ' ';
            }

            // If this character is escaped, skip it
            if (isEscaping) {
                if (curPos !== endPos) {
                    argBuilder += c;
                    isEscaping = false;
                    continue;
                }
            }

            // Are we escaping the next character?
            if (c === '\\' && (!curParam || !curParam.Remainder)) {
                isEscaping = true;
                continue;
            }

            // If we're processing an remainder parameter, ignore all other logic
            if (!!curParam && curParam.Remainder && curPos !== endPos) {
                argBuilder += c;
                continue;
            }

            // If we're not currently processing one, are we starting the next argument yet?
            if (curPart === ParserPart.None) {
                if (/^\s+$/.test(c) || curPos === endPos) {
                    continue; // Skipping whitespace between args
                }

                if (curPos === lastArgEndPos) {
                    return ParseResult.FromError(
                        CommandError.ParseFailed,
                        'There must be at least one character of whitespace between arguments.',
                    );
                }

                if (!curParam) {
                    curParam = command.Parameters[argList.length];
                }

                if (curParam && curParam.Remainder) {
                    argBuilder += c;
                    continue;
                }

                if (c === '"') {
                    curPart = ParserPart.QuotedParameter;
                    continue;
                }

                curPart = ParserPart.Parameter;
            }

            // Has this parameter ended yet?
            let argString: string;
            if (curPart === ParserPart.Parameter) {
                if (curPos === endPos || /^\s+$/.test(c)) {
                    argString     = argBuilder;
                    argBuilder    = '';
                    lastArgEndPos = curPos;
                } else {
                    argBuilder += c;
                }
            } else if (curPart === ParserPart.QuotedParameter) {
                if (c === '"') {
                    argString     = argBuilder;
                    argBuilder    = '';
                    lastArgEndPos = curPos + 1;
                } else {
                    argBuilder += c;
                }
            }

            if (argString) {
                if (!curParam) {
                    return ParseResult.FromError(CommandError.BadArgCount, 'The input text has too many parameters.');
                }

                let typeReaderResult: TypeReaderResult = await this.ParseType(curParam, context, argString);
                if (!typeReaderResult.IsSuccess && typeReaderResult.Error !== CommandError.MultipleMatches) {
                    return ParseResult.FromError(typeReaderResult.Error, typeReaderResult.ErrorReason);
                }

                if (curParam.IsMultiple) {
                    paramList.push(typeReaderResult);
                    curPart = ParserPart.None;
                } else {
                    argList.push(typeReaderResult);
                    curParam = null;
                    curPart  = ParserPart.None;
                }
                argBuilder = '';
            }
        }

        if (curParam && curParam.Remainder) {
            let typeReaderResult: TypeReaderResult = await this.ParseType(curParam, context, argBuilder);
            if (!typeReaderResult.IsSuccess) {
                return ParseResult.FromError(typeReaderResult.Error, typeReaderResult.ErrorReason);
            }

            argList.push(typeReaderResult);
        }

        if (isEscaping) {
            return ParseResult.FromError(CommandError.ParseFailed, 'Input text may not end on an incomplete escape.');
        }

        if (curPart === ParserPart.QuotedParameter) {
            return ParseResult.FromError(CommandError.ParseFailed, 'A quoted parameter is incomplete');
        }

        for (let index of command.RequiredFields) {
            if (!argList[index]) {
                return ParseResult.FromError(CommandError.ParseFailed, 'A required value is missing.');
            }
        }

        // Add missing optionals
        for (let i: number = argList.length; i < command.Parameters.length; i++) {
            const param: ParameterInfo = command.Parameters[i];
            if (param.IsMultiple) {
                continue;
            }
            if (!param.IsOptional && param.DefaultValue === undefined) {
                return ParseResult.FromError(CommandError.BadArgCount, 'The input text has too few parameters.');
            }
            argList.push(TypeReaderResult.FromSuccess(new TypeReaderValue(param.DefaultValue, 1.0)));
        }

        return ParseResult.FromSuccess(argList, paramList);
    }

    private async ParseType(
        curParam: ParameterInfo, context: CommandContext, argString: string,
    ): Promise<TypeReaderResult> {
        const readers: any[] = [
            ArrayTypeReader,
            UserTypeReader,
            DateTypeReader,
            ChannelTypeReader,
            RoleTypeReader,
            MemberTypeReader,
            DurationTypeReader,
            EnumTypeReader,
            PrimitiveTypeReader,
        ];

        for (let cls of readers) {
            let reader: AbstractTypeReader = new cls();
            if (reader instanceof EnumTypeReader) {
                if (curParam.Type === undefined) {
                    continue;
                }
                reader.SetEnum(curParam.Type);
            }

            if (reader.GetTypes() === null || reader.GetTypes().indexOf(curParam.Type) >= 0) {
                return reader.Read(this.client, context, argString);
            }
        }
    }
};
