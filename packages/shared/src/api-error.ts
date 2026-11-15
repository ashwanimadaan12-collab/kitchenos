/** Shape of every error response returned by apps/api's global exception filter. */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  path: string;
  timestamp: string;
  requestId?: string;
}
