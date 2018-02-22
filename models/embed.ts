export interface Embed {
    title?: string;
    description?: string;
    url?: string;
    timestamp?: string;
    color?: number;
    footer?: Footer;
    image?: Image;
    thumbnail?: Image;
    video?: any;
    provider?: Reference;
    author?: Author;
    fields?: Field[]
}

export interface Footer {
    text?: string;
    icon_url?: string;
    proxy_icon_url?: string;
}

export interface Reference {
    name: string;
    url: string;
}

export interface Author extends Reference {
    icon_url: string;
    proxy_icon_url: string;
}

export interface Image {
    url: string;
    proxy_url?: string;
    height?: number;
    width?: number;
}

export interface Field {
    name: string;
    value: string;
    inline?: boolean;
}