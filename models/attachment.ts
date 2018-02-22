import { Embed } from './embed';

export interface Attachment {
    content?: string;
    username?: string;	//override the default username of the webhook
    avatar_url?: string; //override the default avatar of the webhook
    tts?: boolean; //true if this is a TTS message	false

    embeds?: Embed[];
}