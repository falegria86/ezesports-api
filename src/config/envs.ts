import 'dotenv/config';
import { get } from 'env-var';

export const envs = {
    PORT: get('PORT').required().asPortNumber(),
    HOST: get('POSTGRES_URL').required().asString(),
}