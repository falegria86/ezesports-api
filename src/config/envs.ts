import 'dotenv/config';
import { get } from 'env-var';

export const envs = {
    PORT: get('PORT').required().asPortNumber(),
    HOST: get('POSTGRES_URL').required().asString(),
    LOCAL_API_URL: get('LOCAL_API_URL').default('http://localhost:3001').asString(),
    API_KEY: get('API_KEY').required().asString(),
}