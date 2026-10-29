import {
  ArgumentsHost,
  HttpException,
  Logger,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import { NotFoundFilter } from './not-found.filter';
import { NotFoundException } from '@nestjs/common';

function context(mode: 'html' | 'htmx' | 'json') {
  const response = {
    headersSent: false,
    status: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    render: jest.fn(),
    json: jest.fn(),
  };
  const request = {
    get: () => (mode === 'htmx' ? 'true' : undefined),
    accepts: () => (mode === 'json' ? 'json' : 'html'),
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('Fallback exception presentation', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([401, 403, 409, 422, 429, 500])(
    'renders a marked HTMX toast for %s',
    (status) => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { host, response } = context('htmx');
      new HttpExceptionFilter().catch(
        new HttpException('message', status),
        host,
      );
      expect(response.status).toHaveBeenCalledWith(status);
      expect(response.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'X-QCMS-Toast': 'true',
          'HX-Retarget': '#toast-root',
        }),
      );
      expect(response.render).toHaveBeenCalledWith(
        'partials/ui/toast',
        expect.objectContaining({ layout: false }),
      );
    },
  );

  it('shows useful validation messages', () => {
    const { host, response } = context('htmx');
    new HttpExceptionFilter().catch(
      new UnprocessableEntityException({
        message: 'Validation failed',
        errors: { email: 'Invalid email' },
      }),
      host,
    );
    expect(response.render).toHaveBeenCalledWith('partials/ui/toast', {
      layout: false,
      message: 'Invalid email',
    });
  });

  it('preserves structured API validation errors', () => {
    const { host, response } = context('json');
    const body = { message: 'Invalid', errors: { email: 'Invalid email' } };
    new HttpExceptionFilter().catch(
      new UnprocessableEntityException(body),
      host,
    );
    expect(response.json).toHaveBeenCalledWith({ ...body, statusCode: 422 });
  });

  it('renders ordinary HTML errors without an authenticated layout', () => {
    const { host, response } = context('html');
    new HttpExceptionFilter().catch(
      new UnauthorizedException('Invalid credentials'),
      host,
    );
    expect(response.render).toHaveBeenCalledWith(
      'errors/error',
      expect.objectContaining({
        layout: false,
        statusCode: 401,
        message: 'Invalid credentials',
      }),
    );
  });

  it.each(['html', 'htmx', 'json'] as const)(
    'hides unexpected error details in %s',
    (mode) => {
      const log = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      const { host, response } = context(mode);
      new HttpExceptionFilter().catch(
        new Error('private database details'),
        host,
      );
      expect(response.status).toHaveBeenCalledWith(500);
      expect(
        JSON.stringify([response.json.mock.calls, response.render.mock.calls]),
      ).not.toContain('private database details');
      expect(log).toHaveBeenCalled();
    },
  );

  it('does not write after headers are sent', () => {
    const { host, response } = context('html');
    response.headersSent = true;
    new HttpExceptionFilter().catch(new UnauthorizedException(), host);
    expect(response.render).not.toHaveBeenCalled();
  });

  it('renders a standalone 404 for browser navigation', () => {
    const { host, response } = context('html');
    new NotFoundFilter().catch(new NotFoundException(), host);
    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.render).toHaveBeenCalledWith(
      'errors/404',
      expect.objectContaining({ layout: false }),
    );
  });

  it('never inserts a full 404 document into an HTMX target', () => {
    const { host, response } = context('htmx');
    new NotFoundFilter().catch(new NotFoundException(), host);
    expect(response.render).toHaveBeenCalledWith(
      'partials/ui/toast',
      expect.objectContaining({ layout: false }),
    );
  });

  it('keeps 404 API responses as JSON', () => {
    const { host, response } = context('json');
    new NotFoundFilter().catch(new NotFoundException(), host);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 404,
      message: 'Resource not found',
    });
  });
});
