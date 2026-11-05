// Violation: components/ imports from persistence/.
import { localStorageRepository } from '../../persistence/localStorageRepository';

export const repository = localStorageRepository;
