export type BrowserRenderErrorCode =
    | 'INVALID_OPTIONS'
    | 'BROWSER_LAUNCH_FAILED'
    | 'NAVIGATION_FAILED'
    | 'TIMEOUT'
    | 'RENDER_FAILED';


export class BrowserRenderError
extends Error {

    readonly code:
        BrowserRenderErrorCode;

    readonly url:
        string;


    constructor(
        code:
            BrowserRenderErrorCode,

        url:
            string,

        message:
            string,

        options?:
            {
                cause?: unknown;
            },
    ) {

        super(
            message,
            {
                cause:
                    options?.cause,
            },
        );


        this.name =
            'BrowserRenderError';


        this.code =
            code;


        this.url =
            url;
    }
}