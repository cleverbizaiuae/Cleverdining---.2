export const shouldShowReviewOrderModal = (
  requested: boolean,
  validItemCount: number,
): boolean => requested && validItemCount > 0;
