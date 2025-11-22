/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";

import axiosInstance from "../lib/axios";

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: number;
  apiBaseUrl?: string; // Optional base URL for API
  onSuccess?: (response: any) => void; // Callback for successful submission
  onError?: (error: any) => void; // Callback for error handling
}

const ReviewModal: React.FC<ReviewModalProps> = ({
  isOpen,
  onClose,
  orderId,
  onSuccess,
  onError,
}) => {
  const [reviewText, setReviewText] = useState("");
  const [rating, setRating] = useState(4);
  const [guestNo, setGuestNo] = useState(""); // Add state for guest number
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const handleSubmit = async () => {
    if (reviewText.trim() === "") {
      setSubmitError("Please write a review before submitting.");
      return;
    }

    if (guestNo.trim() === "") {
      setSubmitError("Please provide the number of guests.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const reviewData = {
      order: orderId,
      rating,
      name: reviewText.trim(),
      guest_no: guestNo.trim(), // Include guest number
      submittedAt: new Date().toISOString(),
    };

    try {
      console.log(reviewData);
      const response = await axiosInstance.post(
        "/customer/reviews/create/",
        reviewData,
        {
          timeout: 10000,
        }
      );

      console.log("Review submitted successfully:", response.data);
      setSubmitSuccess(true);

      if (onSuccess) {
        onSuccess(response.data);
      }

      // Close modal after success
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (error: any) {
      let errorMessage = "Failed to submit review. Please try again.";

      if (error.response) {
        // Server responded with error
        errorMessage =
          error.response.data?.message || `Error: ${error.response.status}`;
      } else if (error.request) {
        // No response received
        errorMessage = "Network error. Please check your connection.";
      } else if (error.code === "ECONNABORTED") {
        // Timeout
        errorMessage = "Request timed out. Please try again.";
      }

      console.error("Error submitting review:", error);
      setSubmitError(errorMessage);

      if (onError) {
        onError(error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    // Reset all states when closing
    setReviewText("");
    setRating(4);
    setGuestNo(""); // Reset guest number
    setIsSubmitting(false);
    setSubmitError(null);
    setSubmitSuccess(false);
    onClose();
  };

  const handleRatingClick = (selectedRating: number) => {
    setRating(selectedRating);
    setSubmitError(null); // Clear any previous errors
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex justify-center items-center bg-black/60 backdrop-blur-sm z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl transform transition-all duration-300 scale-100 opacity-100">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-900">
              Share Your Experience
            </h3>
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="text-gray-400 hover:text-gray-600 transition-colors duration-200 p-1 rounded-full hover:bg-gray-100"
              aria-label="Close modal"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-1">Order #{orderId}</p>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {submitSuccess ? (
            // Success State
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h4 className="text-lg font-semibold text-gray-900 mb-2">
                Thank You!
              </h4>
              <p className="text-gray-600">
                Your review has been submitted successfully.
              </p>
            </div>
          ) : (
            <>
              {/* Rating Section */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  How would you rate your experience?
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => handleRatingClick(star)}
                      disabled={isSubmitting}
                      className="p-1 transition-transform duration-200 hover:scale-110 disabled:hover:scale-100"
                      aria-label={`Rate ${star} star${star !== 1 ? "s" : ""}`}
                    >
                      <svg
                        className={`w-8 h-8 transition-colors duration-200 ${
                          star <= rating
                            ? "text-yellow-400 fill-current"
                            : "text-gray-300 hover:text-yellow-200"
                        }`}
                        fill={star <= rating ? "currentColor" : "none"}
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                        />
                      </svg>
                    </button>
                  ))}
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  {rating === 1 && "We're sorry to hear about your experience"}
                  {rating === 2 && "We appreciate your feedback"}
                  {rating === 3 && "Thank you for your honest feedback"}
                  {rating === 4 &&
                    "Great! We're glad you had a good experience"}
                  {rating === 5 && "Excellent! We're thrilled you loved it"}
                </p>
              </div>

              {/* Guest Number Input */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Number of Guests
                </label>
                <input
                  type="number"
                  value={guestNo}
                  onChange={(e) => setGuestNo(e.target.value)}
                  placeholder="Enter number of guests"
                  disabled={isSubmitting}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min={1}
                  required
                />
              </div>

              {/* Review Text Section */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Customer Name
                </label>
                <input
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder="Name"
                  disabled={isSubmitting}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  maxLength={500}
                />
              </div>

              {/* Error Display */}
              {submitError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center">
                    <svg
                      className="w-5 h-5 text-red-500 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <p className="text-sm text-red-700">{submitError}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!submitSuccess && (
          <div className="px-6 py-4 bg-gray-50 rounded-b-2xl">
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || reviewText.trim() === ""}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <svg
                      className="animate-spin w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        className="opacity-25"
                      ></circle>
                      <path
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        className="opacity-75"
                      ></path>
                    </svg>
                    Submitting...
                  </>
                ) : (
                  "Submit Review"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReviewModal;
