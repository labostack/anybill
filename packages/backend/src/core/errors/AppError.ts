import { Exception } from "@tsed/exceptions";
import { ErrorCode } from "./ErrorCode";

export class AppError extends Exception {
    constructor(
        status: number,
        public readonly code: ErrorCode,
        message: string,
        public readonly details?: any
    ) {
        super(status, message);
    }
}
