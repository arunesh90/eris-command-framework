import {Client, Collection, Member} from 'eris';
import {Dictionary} from 'typescript-collections';

import CommandContext from '../CommandContext';
import CommandError from '../CommandError';
import TypeReaderResult from '../Result/TypeReaderResult';
import TypeReaderValue from '../Result/TypeReaderValue';
import AbstractTypeReader from './AbstractTypeReader';

export default class MemberTypeReader extends AbstractTypeReader {
    private static AddResult(results: Dictionary<string, TypeReaderValue>, user: Member, score: number): void {
        if (user && !results.containsKey(user.id)) {
            results.setValue(user.id, new TypeReaderValue(user, score));
        }
    }

    public GetTypes(): any[] {
        return [Member];
    }

    // @ts-ignore
    public Read(client: Client, context: CommandContext, input: string): TypeReaderResult {
        const results: Dictionary<string, TypeReaderValue> = new Dictionary<string, TypeReaderValue>();

        if (!context.Guild) {
            return TypeReaderResult.FromError(CommandError.ObjectNotFound, 'Not in Guild context.');
        }

        const guildUsers: Collection<Member> = context.Guild.members;

        // By Mention (1.0)
        let mentionRegex: RegExp = /^<@!?(\d+)>$/;
        if (mentionRegex.test(input)) {
            MemberTypeReader.AddResult(results, guildUsers.find((x) => x.id === mentionRegex.exec(input)[1]), 1.00);
        }

        // By ID (0.9)
        let idRegex: RegExp = /^(\d+)$/;
        if (idRegex.test(input)) {
            MemberTypeReader.AddResult(results, guildUsers.find((x) => x.id === input), 0.90);
        }

        // By Username + Discrim (0.7-0.85)
        let index: number = input.lastIndexOf('#');
        if (index > 0) {
            const username: string = input.substring(0, index);
            const discrim: string  = input.substring(index + 1);

            let guildUser: Member = guildUsers.find(
                (x) => x.user.discriminator === discrim && x.username.toLowerCase() === username.toLowerCase(),
            );

            if (guildUser) {
                MemberTypeReader.AddResult(results, guildUser, guildUser.username === username ? 0.85 : 0.75);
            }
        }

        // By Username (0.5-0.65)
        for (let user of guildUsers.filter((x) => x.username.toLowerCase() === input.toLowerCase())) {
            MemberTypeReader.AddResult(results, user, user.username === input ? 0.65 : 0.55);
        }

        // By Nickname (0.5-0.65)
        for (let user of context.Guild.members.filter((x) => x.nick && x.nick.toLowerCase() === input.toLowerCase())) {
            MemberTypeReader.AddResult(results, user, user.username === input ? 0.65 : 0.55);
        }

        if (results.size() > 0) {
            return TypeReaderResult.FromSuccess(results.values());
        }

        return TypeReaderResult.FromError(CommandError.ObjectNotFound, 'User not found.');
    }
};
