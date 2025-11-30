import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { Star, Mic, X } from "lucide-react";
import { useState } from "react";
import { cn } from "clsx-for-tailwind";

interface ReviewModalProps {
    isOpen: boolean;
    close: () => void;
    onSubmit: (rating: number, comment: string) => void;
}

export const ReviewModal = ({ isOpen, close, onSubmit }: ReviewModalProps) => {
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState("");

    const handleSubmit = () => {
        onSubmit(rating, comment);
        close();
        setRating(0);
        setComment("");
    };

    return (
        <Dialog open={isOpen} onClose={close} className="relative z-50">
            <DialogBackdrop
                transition
                className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200"
            />

            <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
                <div className="flex min-h-full items-center justify-center p-4 text-center">
                    <DialogPanel
                        transition
                        className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all data-[closed]:translate-y-4 data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200"
                    >
                        <div className="flex justify-between items-center mb-4">
                            <DialogTitle as="h3" className="text-lg font-bold leading-6 text-gray-900">
                                Rate your experience
                            </DialogTitle>
                            <button onClick={close} className="text-gray-400 hover:text-gray-500">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex flex-col gap-6">
                            {/* Star Rating */}
                            <div className="flex justify-center gap-2">
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                        key={star}
                                        onClick={() => setRating(star)}
                                        className="focus:outline-none transition-transform hover:scale-110"
                                    >
                                        <Star
                                            size={32}
                                            className={cn(
                                                "transition-colors duration-200",
                                                rating >= star
                                                    ? "fill-yellow-400 text-yellow-400"
                                                    : "fill-gray-100 text-gray-300"
                                            )}
                                        />
                                    </button>
                                ))}
                            </div>

                            {/* Comment Box */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">
                                    Comments
                                </label>
                                <textarea
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    placeholder="Tell us what you liked..."
                                    className="w-full rounded-xl border-gray-200 bg-gray-50 p-3 text-sm focus:border-blue-500 focus:ring-blue-500 min-h-[100px] resize-none"
                                />
                            </div>

                            {/* Audio Record Mockup */}
                            <button className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors">
                                <Mic size={18} />
                                <span className="text-sm font-medium">Record Audio Message</span>
                            </button>

                            {/* Actions */}
                            <div className="flex gap-3 mt-2">
                                <button
                                    onClick={close}
                                    className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={rating === 0}
                                    className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    Submit Review
                                </button>
                            </div>
                        </div>
                    </DialogPanel>
                </div>
            </div>
        </Dialog>
    );
};
