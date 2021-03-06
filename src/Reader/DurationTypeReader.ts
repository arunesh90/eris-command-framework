import {Client} from 'eris';
import * as moment from 'moment-timezone';

import CommandContext from '../CommandContext';
import CommandError from '../CommandError';
import DurationParam from '../Model/DurationParam';
import TypeReaderResult from '../Result/TypeReaderResult';
import TypeReaderValue from '../Result/TypeReaderValue';
import AbstractTypeReader from './AbstractTypeReader';

export default class DurationTypeReader extends AbstractTypeReader {

    private static ParseDuration(input: string): moment.Duration {
        const days: string    = '(d(ays?)?)';
        const hours: string   = '(h((ours?)|(rs?))?)';
        const minutes: string = '(m((inutes?)|(ins?))?)';
        const seconds: string = '(s((econds?)|(ecs?))?)';

        const regex: RegExp = new RegExp(
            `\\s*(\\d+)\\s*((${days}|${hours}|${minutes}|${seconds}|\\Z))`,
            'ig',
        );
        let m;

        let duration: moment.Duration = moment.duration(0);
        let matches                   = 0;
        while (true) {
            m = regex.exec(input);
            if (m === null) {
                break;
            }
            matches++;

            // This is necessary to avoid infinite loops with zero-width matches
            if (m.index === regex.lastIndex) {
                regex.lastIndex++;
            }

            if (new RegExp('\A' + days).test(m[2])) {
                duration.add(parseInt(m[1], 10), 'd');
            } else if (new RegExp(hours).test(m[2])) {
                duration.add(parseInt(m[1], 10), 'h');
            } else if (new RegExp(minutes).test(m[2])) {
                duration.add(parseInt(m[1], 10), 'm');
            } else if (new RegExp(seconds).test(m[2])) {
                duration.add(parseInt(m[1], 10), 's');
            } else {
                throw new Error('Failed to parse duration');
            }
        }

        if (matches === 0) {
            throw new Error('Failed to parse duration');
        }

        return duration;
    }

    public GetTypes(): any[] {
        return [DurationParam];
    }

    // @ts-ignore
    public Read(client: Client, context: CommandContext, input: string): TypeReaderResult {
        try {
            const duration: moment.Duration = DurationTypeReader.ParseDuration(input);
            if (moment.isDuration(duration)) {
                return TypeReaderResult.FromSuccess(new TypeReaderValue(duration, 1.0));
            }
        } catch (error) {}

        return TypeReaderResult.FromError(CommandError.ParseFailed, 'Unable to parse duration.');
    }
};
