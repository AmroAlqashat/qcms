import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { renderAuthError } from './auth-form-error';

@Catch(HttpException)
export class SignInErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    renderAuthError(exception, host, 'auth/sign-in-page', ['email']);
  }
}
