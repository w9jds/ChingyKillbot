import {UserAgent} from '../config/config';

let headers = {
    'Accept': 'application/json',
    'User-Agent' : UserAgent
};

export async function verifyResponse(response): Promise<any> {
    if (response.status >= 200 && response.status <= 300) {
        return response.json();
    }
    else if (response.bodyUsed) {
        let error = await response.json();

        return {
            error: true,
            body: response.body,
            statusCode: response.status,
            message: error,
            url: response.url
        };
    }
    else {
        return {
            error: true,
            statusCode: response.status,
            uri: response.url
        }
    }
}

export const search = (query: string): Promise<any> => {
    return fetch(`https://esi.tech.ccp.is/latest/search/?categories=alliance%2Ccharacter%2Ccorporation&datasource=tranquility&language=en-us&search=${query}&strict=false`, {
        method: 'GET',
        headers
    }).then(verifyResponse);
}

export const getNames = (ids: string[] | number[]): Promise<any> => {
    return fetch('https://esi.tech.ccp.is/v2/universe/names/', {
        method: 'POST',
        body: JSON.stringify(ids),
        headers: {
            'Content-Type': 'application/json',
            ...headers
        }
    }).then(verifyResponse);
}