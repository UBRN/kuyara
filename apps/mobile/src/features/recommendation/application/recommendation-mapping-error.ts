/** A context, an AI answer or a stored row that does not rebuild into a valid recommendation. */
export class WorkerAiRecommendationMappingError extends Error {
  constructor() {
    super('The AI recommendation could not be mapped.');
    this.name = 'WorkerAiRecommendationMappingError';
  }
}
