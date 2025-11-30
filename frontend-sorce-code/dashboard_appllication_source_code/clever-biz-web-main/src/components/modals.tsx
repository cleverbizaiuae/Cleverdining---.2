/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import {
  DateInput,
  InputImageUploadBox,
  InputVideoUploadBox,
  LabelInput,
  LabelTextarea,
  PickCompanyLogo,
} from "./input";
import {
  BtnBold,
  BtnItalic,
  BtnBulletList,
  ContentEditableEvent,
  Editor,
  Toolbar,
  BtnStyles,
  BtnNumberedList,
  BtnStrikeThrough,
  BtnLink,
  BtnUndo,
  BtnRedo,
} from "react-simple-wysiwyg";
import { useCallback, useEffect, useState } from "react";
import { set, SubmitHandler, useForm, Controller } from "react-hook-form";
import toast from "react-hot-toast";
import axiosInstance from "@/lib/axios";
import { ImSpinner6 } from "react-icons/im";
import { useOwner } from "@/context/ownerContext";
import { useRole } from "@/hooks/useRole";
import { FiX } from "react-icons/fi";
import { useAdmin } from "@/context/adminContext";
import AssistantCredentials from "@/types";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import "./intt.css";
import axios from "axios";
/* Edit food item dialog ===========================================================>>>>> */
type ModalPropsCall = {
  socketRef?: React.RefObject<WebSocket>;
  peerRef?: React.RefObject<RTCPeerConnection>;
  localStreamRef?: React.RefObject<MediaStream>;
  isOpen: boolean;
  close: () => void;
  id?: number | null;
  onSuccess?: () => void;
};
type ModalProps = {
  isOpen: boolean;
  close: () => void;
  id?: number | null;
  onSuccess?: () => void;
};

export const EditFoodItemModal: React.FC<ModalProps> = ({
  isOpen,
  close,
  id,
  onSuccess,
}) => {
  type Inputs = {
    price: string;
    name: string;
    category: string;
    sub_category?: string;
    description: string;
  };
  type TCategory = {
    id: number;
    Category_name: string;
    slug: string;
    image: string;
    parent_category?: number | null;
  };
  const { categories, fetchCategories, updateFoodItem, createFoodItem } =
    useOwner();
  const { userRole, isLoading } = useRole();
  const { register, handleSubmit, reset, setValue, watch } = useForm<Inputs>();
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [existingImage, setExistingImage] = useState<string | null>(null);
  const [existingVideo, setExistingVideo] = useState<string | null>(null);
  const [allCate, setAllCate] = useState<TCategory[]>([]);
  const [showSubCatInput, setShowSubCatInput] = useState(false);
  const [newSubCatName, setNewSubCatName] = useState("");

  const selectedCategory = watch("category");
  const subCategories = allCate.filter(c => c.parent_category === Number(selectedCategory));

  const handleCreateSubCategory = async () => {
    if (!newSubCatName) return toast.error("Enter subcategory name");
    if (!selectedCategory) return toast.error("Select a main category first");

    try {
      await axiosInstance.post("/owners/categories/", {
        Category_name: newSubCatName,
        parent_category: selectedCategory
      });
      toast.success("Subcategory created");
      setNewSubCatName("");
      setShowSubCatInput(false);
      // Trigger refresh
      const endpoint = "/owners/categories/";
      const res = await axiosInstance.get(endpoint);
      setAllCate(res.data);
    } catch (e) {
      console.error(e);
      toast.error("Failed to create subcategory");
    }
  };
  // Load categories when userRole is available
  const user = localStorage.getItem("userInfo");
  const parseUser = JSON.parse(user || "{}");

  useEffect(() => {
    const fetchCategories = async () => {
      if (!isLoading || !userRole) {
        return;
      }

      try {
        let endpoint;
        if (parseUser?.role === "owner") {
          endpoint = "/owners/categories/";
        } else if (parseUser?.role === "staff") {
          endpoint = "/staff/categories/";
        } else if (parseUser?.role === "chef") {
          endpoint = "/chef/categories/";
        } else {
          throw new Error("Invalid user role");
        }

        const res = await axiosInstance.get(endpoint);
        console.log(res, "categories response");
        setAllCate(res.data); // Make sure you're setting the correct response data
      } catch (err) {
        console.error("Failed to load categories.", err);
      }
    };

    fetchCategories();
  }, [parseUser?.role]);

  useEffect(() => {
    if (!isLoading && userRole) {
      fetchCategories();
    }
  }, [userRole, isLoading, fetchCategories]);

  // Load single food item data if in edit mode
  console.log(userRole, "user role in edit modal");
  useEffect(() => {
    if (id) {
      const fetchItem = async () => {
        try {
          let endpoint;
          // Use role-based API endpoint
          if (userRole === "owner") {
            endpoint = `/owners/items/${id}/`;
          } else if (userRole === "staff") {
            endpoint = `/staff/items/${id}/`;
          } else if (userRole === "chef") {
            endpoint = `/chef/items/${id}/`;
          } else {
            throw new Error("Invalid user role");
          }

          const res = await axiosInstance.get(endpoint);
          const item = res.data;
          console.log(item);
          reset({
            name: item.item_name,
            price: item.price,
            category: item.category.toString(),
            sub_category: item.sub_category?.toString(),
            description: item.description,
          });
          // Set existing media files
          if (item.image1) {
            let url = item.image1;
            // Fix double media path
            // url = url.replace("/media/media/", "/media/");
            // Force HTTPS
            if (url.startsWith("http://")) {
              url = url.replace("http://", "https://");
            }
            // Handle relative paths
            if (url.startsWith("/")) {
              url = `https://cleverdining-2.onrender.com${url}`;
            }
            setExistingImage(url);
          }
          if (item.video) {
            let url = item.video;
            // Fix double media path
            // url = url.replace("/media/media/", "/media/");
            // Force HTTPS
            if (url.startsWith("http://")) {
              url = url.replace("http://", "https://");
            }
            // Handle relative paths
            if (url.startsWith("/")) {
              url = `https://cleverdining-2.onrender.com${url}`;
            }
            setExistingVideo(url);
          }
        } catch (err) {
          console.error("Failed to load item for edit", err);
          toast.error("Failed to load item.");
        }
      };
      fetchItem();
    } else {
      reset(); // clear form for create mode
      setImageFile(null);
      setVideoFile(null);
      setExistingImage(null);
      setExistingVideo(null);
    }
  }, [id, reset, userRole]);

  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    setLoading(true);
    const formData = new FormData();
    formData.append("item_name", data.name);
    formData.append("price", data.price.toString());
    formData.append("category", data.category);
    if (data.sub_category) formData.append("sub_category", data.sub_category);
    formData.append("description", data.description);

    if (imageFile) formData.append("image1", imageFile);
    if (videoFile) formData.append("video", videoFile);

    try {
      if (id) {
        // For edit mode, check if we have any media (new or existing)
        // if (!imageFile && !existingImage) {
        //   setLoading(false);
        //   return toast.error(
        //     "Please upload an image or keep the existing one."
        //   );
        // }
        // if (!videoFile && !existingVideo) {
        //   setLoading(false);
        //   return toast.error("Please upload a video or keep the existing one.");
        // }

        await updateFoodItem(id, formData);
      } else {
        // For create mode, make image and video optional
        // if (!imageFile) return toast.error("Please upload an image.");
        // if (!videoFile) return toast.error("Please upload a video.");

        await createFoodItem(formData);
      }

      // Reset form and state
      reset();
      setImageFile(null);
      setVideoFile(null);
      setExistingImage(null);
      setExistingVideo(null);

      // Close modal
      close();
    } catch (err) {
      console.error("Failed to submit item", err);
      // Error handling is done in the context functions
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} as="div" className="relative z-10" onClose={close}>
      <DialogBackdrop className="fixed inset-0 bg-black/30" />
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel className="w-full max-w-xl rounded-xl bg-sidebar/80 p-6 backdrop-blur-xl">
            <DialogTitle className="text-base font-medium text-white mb-8">
              {id ? "Edit Food Item" : "Add New Food Item"}
            </DialogTitle>
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-col gap-y-4"
            >
              <LabelInput
                label="Item Name"
                labelProps={{ className: "text-sm" }}
                inputProps={{
                  className: "bg-[#201C3F] shadow-md text-sm",
                  ...register("name", { required: true }),
                }}
              />
              <div className="flex gap-x-4">
                <div className="basis-[30%]">
                  <LabelInput
                    label="Price"
                    labelProps={{ className: "text-sm" }}
                    inputProps={{
                      className: "bg-[#201C3F] shadow-md text-sm",
                      type: "number",
                      ...register("price", { required: true }),
                    }}
                  />
                </div>
                <div className="basis-[70%]">
                  <label className="block text-sm text-white mb-1">
                    Food Category
                  </label>
                  <select
                    {...register("category", { required: true })}
                    className="bg-[#201C3F] shadow-md text-sm w-full px-3 py-2 rounded-md text-white"
                  >
                    <option value="">Select category</option>
                    {allCate?.filter(c => !c.parent_category).map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.Category_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sub Category Section */}
              {selectedCategory && (
                <div className="flex gap-x-4">
                  <div className="basis-[100%]">
                    <label className="block text-sm text-white mb-1">Sub Category</label>
                    <div className="flex gap-2">
                      <select
                        {...register("sub_category")}
                        className="bg-[#201C3F] shadow-md text-sm w-full px-3 py-2 rounded-md text-white"
                      >
                        <option value="">Select Subcategory</option>
                        {subCategories.map(sub => (
                          <option key={sub.id} value={sub.id}>{sub.Category_name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowSubCatInput(!showSubCatInput)}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-xs whitespace-nowrap"
                      >
                        + New
                      </button>
                    </div>
                    {showSubCatInput && (
                      <div className="flex gap-2 mt-2 items-center">
                        <input
                          value={newSubCatName}
                          onChange={e => setNewSubCatName(e.target.value)}
                          placeholder="New Subcategory Name"
                          className="bg-[#201C3F] text-white text-sm px-2 py-1 rounded flex-1"
                        />
                        <button
                          type="button"
                          onClick={handleCreateSubCategory}
                          className="px-3 py-1 bg-green-600 text-white rounded text-xs"
                        >
                          Add
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <LabelTextarea
                label="Description"
                labelProps={{ className: "text-sm" }}
                textareaProps={{
                  placeholder: "Enter here...",
                  rows: 6,
                  className: "bg-[#201C3F] shadow-md text-sm",
                  ...register("description", { required: true }),
                }}
              />

              {/* Show existing image if editing */}
              {existingImage && !imageFile && (
                <div className="space-y-4">
                  <label className="block text-primary-text text-sm font-medium">
                    Current Image
                  </label>
                  <div className="relative mt-4 inline-block">
                    <img
                      src={existingImage}
                      alt="Current image"
                      className="rounded-md max-h-60 object-contain border border-gray-600"
                    />
                    <button
                      onClick={() => setExistingImage(null)}
                      className="absolute top-1 right-1 p-1 bg-black bg-opacity-60 text-white rounded-full"
                    >
                      <FiX className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              <InputImageUploadBox file={imageFile} setFile={setImageFile} />

              {/* Show existing video if editing */}
              {existingVideo && !videoFile && (
                <div className="space-y-4">
                  <label className="block text-primary-text text-sm font-medium">
                    Current Video
                  </label>
                  <div className="relative mt-4 inline-block">
                    <video
                      src={existingVideo}
                      controls
                      className="rounded-md max-h-60 object-contain border border-gray-600"
                    />
                    <button
                      onClick={() => setExistingVideo(null)}
                      className="absolute top-1 right-1 p-1 bg-black bg-opacity-60 text-white rounded-full"
                    >
                      <FiX className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              <InputVideoUploadBox file={videoFile} setFile={setVideoFile} />
              <button className="button-primary" type="submit">
                {loading ? (
                  <span className="flex gap-3 items-center justify-center">
                    <ImSpinner6 className="animate-spin" /> Loading...
                  </span>
                ) : id ? (
                  "Update"
                ) : (
                  "Submit"
                )}
              </button>
            </form>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
};

/* <<<<<<<<===================================================== Edit food item dialog */

/* Delete food item dialog ===========================================================>>>>> */
type DeleteFoodItemModalProps = ModalProps & {
  id?: number | null;
};

export const DeleteFoodItemModal: React.FC<DeleteFoodItemModalProps> = ({
  isOpen,
  close,
  id,
}) => {
  const { deleteFoodItem } = useOwner();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!id) {
      toast.error("No item selected for deletion.");
      return;
    }

    setLoading(true);
    try {
      await deleteFoodItem(id);
      close();
    } catch (err) {
      console.error("Failed to delete item", err);
      // Error handling is done in the context function
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      as="div"
      className="relative z-10 focus:outline-none"
      onClose={close}
    >
      <DialogBackdrop className="fixed inset-0 bg-black/20" />
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel
            transition
            className="w-full max-w-md rounded-xl bg-sidebar/80 p-6 backdrop-blur-2xl duration-300 ease-out data-[closed]:transform-[scale(95%)] data-[closed]:opacity-0"
          >
            <DialogTitle as="h3" className="text-base/7 font-medium text-white">
              Delete Food Item
            </DialogTitle>
            <p className="mt-2 text-sm/6 text-white/50">
              Are you sure you want to delete this food item? This action cannot
              be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
                onClick={close}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                className="button-primary inline-flex items-center gap-2 rounded-md py-2 px-4 text-sm/6 font-semibold text-white shadow-inner shadow-white/5 focus:outline-none data-[hover]:bg-red-600 data-[focus]:outline-1 data-[focus]:outline-white data-[open]:bg-red-700 bg-red-500 hover:bg-red-600"
                onClick={handleDelete}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <ImSpinner6 className="animate-spin w-4 h-4" />
                    Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
};

/* <<<<<<<<===================================================== Delete food item dialog */

/* Call Confirm Dialog ===========================================================>>>>> */
interface ModalConfirm extends ModalProps {
  confirm: () => void;
}
export const ModalCallConfirm: React.FC<ModalConfirm> = ({
  isOpen,
  close,
  confirm,
}) => {
  return (
    <Dialog
      open={isOpen}
      onClose={() => close()}
      className="relative z-50 transition duration-300 ease-out data-[closed]:opacity-0"
      transition={true}
    >
      <DialogBackdrop className="fixed inset-0 bg-black/10" />

      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel className=" bg-primary/90 p-4 rounded-lg shadow-xl min-w-lg">
          <div className="relative max-h-[300px] mx-auto aspect-square rounded-xl overflow-hidden flex flex-col justify-center items-center">
            <p className="text-lg text-primary-text text-center">
              Do you want to call the order table?
            </p>
            <div className="mt-8 flex flex-row justify-center items-center gap-x-16">
              <button onClick={() => close()} className="text-primary-text">
                Cancel
              </button>
              <button
                onClick={confirm}
                className="button-primary px-8 py-3 text-primary-text"
              >
                Confirm
              </button>
            </div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
};
/* <<<<<<<<===================================================== Call Confirm Dialog */

/* Call dialog ===========================================================>>>>> */
export const ModalCall: React.FC<ModalPropsCall & { callStatus?: string }> = ({
  socketRef,
  peerRef,
  localStreamRef,
  isOpen,
  close,
  callStatus,
}) => {
  const handleEndCall = () => {
    if (socketRef?.current) socketRef.current.close();
    if (peerRef?.current) peerRef.current.close();
    if (localStreamRef?.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    close();
    console.log("Call Ended");
  };
  return (
    <Dialog
      open={isOpen}
      onClose={() => close()}
      className="relative z-50 transition duration-300 ease-out data-[closed]:opacity-0"
      transition={true}
    >
      <DialogBackdrop className="fixed inset-0 bg-black/10" />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel className=" bg-primary/90 p-4 rounded-lg shadow-xl min-w-lg">
          <div className="relative max-h-[300px] mx-auto aspect-square rounded-xl overflow-hidden flex flex-col justify-center items-center">
            <div className="flex flex-row gap-x-10">
              {/* Only show End Call button for owner/caller */}
              <button onClick={handleEndCall}>
                <svg
                  width="51"
                  height="51"
                  viewBox="0 0 51 51"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect width="51" height="51" rx="25.5" fill="#FE5050" />
                  <path
                    d="M20.5115 27.9062L20.5056 27.1346C20.5056 27.1346 20.4944 25.301 25.4952 25.525C30.496 25.749 30.5073 27.5826 30.5073 27.5826L30.5112 28.0695C30.5198 29.2661 31.4295 30.3239 32.6536 30.5576L35.1553 31.0369C36.6713 31.3265 38.0259 30.2524 38.0162 28.7704L37.9992 26.1132C37.9934 25.3787 37.759 24.6473 37.198 24.1234C35.7631 22.7842 32.2364 20.3283 25.459 20.0233C18.2726 19.7023 14.7791 22.7769 13.5401 24.2303C13.1469 24.6898 12.9961 25.2867 13.0001 25.8982L13.0169 28.3046C13.0272 29.9302 14.6538 31.1659 16.2572 30.7657L18.7526 30.145C19.8047 29.882 20.5192 28.974 20.5123 27.907"
                    fill="white"
                  />
                </svg>
              </button>
            </div>
            {/* Call status UI */}
            {callStatus === "calling" && (
              <p className="text-primary-text/50 mt-8">Calling...</p>
            )}
            {callStatus === "in_call" && (
              <p className="text-primary-text/50 mt-8">In Call</p>
            )}
            {callStatus === "ended" && (
              <p className="text-primary-text/50 mt-8">Call Ended</p>
            )}
            <p className="text-primary-text">Outgoing call</p>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
};
/* <<<<<<<<===================================================== Call dialog */

/* Delete FAQ Confirmation Modal ===========================================================>>>>> */
interface DeleteFaqModalProps extends ModalProps {
  faqId: number | null;
  faqQuestion: string;
  onConfirm: () => void;
}

export const DeleteFaqModal: React.FC<DeleteFaqModalProps> = ({
  isOpen,
  close,
  faqId,
  faqQuestion,
  onConfirm,
}) => {
  const handleConfirm = () => {
    onConfirm();
    close();
  };

  return (
    <Dialog
      open={isOpen}
      onClose={() => close()}
      className="relative z-50 transition duration-300 ease-out data-[closed]:opacity-0"
      transition={true}
    >
      <DialogBackdrop className="fixed inset-0 bg-black/30 backdrop-blur-sm" />

      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel className="bg-sidebar/95 backdrop-blur-xl p-6 rounded-xl shadow-2xl min-w-md max-w-md border border-primary/20">
          <div className="flex flex-col items-center text-center">
            {/* Warning Icon */}
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>

            {/* Title */}
            <h3 className="text-xl font-semibold text-primary-text mb-2">
              Delete FAQ
            </h3>

            {/* Message */}
            <p className="text-primary-text/80 mb-6 leading-relaxed">
              Are you sure you want to delete this FAQ?
            </p>

            {/* FAQ Question Preview */}
            <div className="bg-primary/20 rounded-lg p-3 mb-6 w-full">
              <p className="text-primary-text/90 text-sm font-medium">
                "{faqQuestion}"
              </p>
            </div>

            {/* Warning */}
            <p className="text-red-400/80 text-sm mb-6">
              This action cannot be undone.
            </p>

            {/* Buttons */}
            <div className="flex gap-3 w-full">
              <button
                onClick={() => close()}
                className="flex-1 px-4 py-2.5 text-primary-text border border-primary-text/30 rounded-lg hover:bg-primary-text/10 transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200 font-medium"
              >
                Delete FAQ
              </button>
            </div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
};
/* <<<<<<<<===================================================== Delete FAQ Confirmation Modal */

/* Dialog Faq Editor ===========================================================>>>>> */
export const ModalFaqEditor: React.FC<ModalProps> = ({ isOpen, close, id }) => {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const { createFAQ, updateFAQ, faqs } = useAdmin();

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      if (id) {
        // Edit mode - find the FAQ to edit
        const faqToEdit = faqs.find((faq) => faq.id === id);
        if (faqToEdit) {
          setQuestion(faqToEdit.question);
          setAnswer(faqToEdit.answer);
        }
      } else {
        // Create mode - reset form
        setQuestion("");
        setAnswer("");
      }
    }
  }, [isOpen, id, faqs]);

  const handleSubmit = async () => {
    if (!question.trim() || !answer.trim()) {
      toast.error("Please fill in both question and answer fields.");
      return;
    }

    setLoading(true);
    try {
      if (id) {
        await updateFAQ(id, question, answer);
      } else {
        await createFAQ(question, answer);
      }
      close();
    } catch (error) {
      // Error is handled in the context
      console.error("Failed to save FAQ");
    } finally {
      setLoading(false);
    }
  };

  function onChange(e: ContentEditableEvent) {
    setAnswer(e.target.value);
  }

  return (
    <Dialog
      open={isOpen}
      onClose={() => close()}
      className="relative z-50 transition duration-300 ease-out data-[closed]:opacity-0"
      transition={true}
    >
      <DialogBackdrop className="fixed inset-0 bg-black/10" />

      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel className=" bg-primary p-4 rounded-lg shadow-xl min-w-lg">
          <div className="flex flex-col justify-center items-stretch">
            <div className="flex flex-col max-h-120 overflow-y-auto scrollbar-hide max-w-xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-primary-text">
                  {id ? "Edit FAQ" : "Add New FAQ"}
                </h3>
                <button
                  onClick={() => close()}
                  className="text-primary-text hover:text-gray-300"
                >
                  <FiX size={24} />
                </button>
              </div>

              <LabelInput
                label="Question"
                inputProps={{
                  placeholder: "Enter FAQ question",
                  value: question,
                  onChange: (e) => setQuestion(e.target.value),
                }}
              />
              <label htmlFor="text" className="mt-2 text-primary-text">
                Answer
              </label>

              <Editor
                id="text"
                value={answer}
                onChange={onChange}
                containerProps={{
                  className: "max-h-200",
                }}
                className="w-full border-none outline-nonew-full p-3 bg-input text-primary-text font-poppins placeholder:font-poppins placeholder:text-input-placeholder rounded-md focus:outline-none focus:ring-0"
              >
                <Toolbar className="bg-blue-300 flex items-center [&_svg]:mx-auto">
                  <BtnStyles />
                  <BtnBold />
                  <BtnItalic />
                  <BtnBulletList />
                  <BtnNumberedList />
                  <BtnStrikeThrough />
                  <BtnLink />
                  <BtnUndo />
                  <BtnRedo />
                </Toolbar>
              </Editor>
            </div>

            <div className="flex justify-end gap-x-2 mt-4">
              <button
                onClick={() => close()}
                disabled={loading}
                className="px-4 py-2 text-primary-text border border-primary-text rounded-md hover:bg-primary-text hover:text-primary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="button-primary px-8 py-2 text-primary-text disabled:opacity-50"
              >
                {loading ? "Saving..." : id ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
};
/* <<<<<<<<===================================================== Dialog Faq Editor */

/* User subscriber detail modal ===========================================================>>>>> */
export const ModalSubscriberDetail: React.FC<ModalProps> = ({
  isOpen,
  close,
}) => {
  const [html, setHtml] = useState(
    `Students can engage with the AI tutor in several ways for a seamless learning experience. They can: Type their questions directly into the chat interface: This is ideal for quick queries and specific problems. Upload homework or problem sets as an image: Our AI will analyze the image, identify the problems, and allow students to work through them with guidance. Potentially speak their questions: Our voice input allows for an even more natural interaction. The AI will then analyze the student's input, highlight any errors, and provide step-by-step correct solutions with clear explanations. This ensures the student not only gets the right answer but also understands the underlying concepts.`
  );

  function onChange(e: ContentEditableEvent) {
    setHtml(e.target.value);
  }

  return (
    <Dialog
      open={isOpen}
      onClose={() => close()}
      className="relative z-50 transition duration-300 ease-out data-[closed]:opacity-0"
      transition={true}
    >
      <DialogBackdrop className="fixed inset-0 bg-black/10" />

      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel className=" bg-primary p-4 rounded-lg shadow-xl min-w-lg">
          <div className="flex flex-col justify-center items-stretch">
            <div className="flex flex-col max-h-120 overflow-y-auto scrollbar-hide max-w-xl">
              <LabelInput
                label="Question"
                inputProps={{
                  placeholder: "Faq question",
                }}
              />
              <label htmlFor="text" className="mt-2 text-primary-text">
                Answer
              </label>

              <Editor
                id="text"
                value={html}
                onChange={onChange}
                containerProps={{
                  className: "max-h-200",
                }}
                className="w-full border-none outline-nonew-full p-3 bg-input text-primary-text font-poppins placeholder:font-poppins placeholder:text-input-placeholder rounded-md focus:outline-none focus:ring-0"
              >
                <Toolbar className="bg-blue-300 flex items-center [&_svg]:mx-auto">
                  <BtnStyles />
                  <BtnBold />
                  <BtnItalic />
                  <BtnBulletList />
                  <BtnNumberedList />
                  <BtnStrikeThrough />
                  <BtnLink />
                  <BtnUndo />
                  <BtnRedo />
                </Toolbar>
              </Editor>
            </div>
            <div className="mt-8 flex flex-row justify-center items-center gap-x-16">
              <button
                onClick={() => close()}
                className="button-primary px-8 py-3 text-primary-text"
              >
                Update
              </button>
            </div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
};
/* <<<<<<<<===================================================== User detail modal */

/* Add Subscriber Modal ===========================================================>>>>> */
export const ModalAddSubscriber: React.FC<ModalProps> = ({
  isOpen,
  close,
  id,
}) => {
  type Inputs = {
    customer_name: string;
    restaurant_name: string;
    location: string;
    starting_date: string;
    phone_number: string;
    package: string;
    company_logo: FileList | undefined;
    email: string;
    password: string;
  };
  const [restaurantData, setRestaurantData] = useState<any>();
  console.log(restaurantData, "restaurantData");
  useEffect(() => {
    const fetchData = async () => {
      const response = await axiosInstance.get(`adminapi/restaurants/${id}/`);
      const data = await response.data;
      console.log(data.created_at, "restaurant data");
      setRestaurantData(data);
      reset({
        restaurant_name: data.resturent_name ?? "",
        location: data.location ?? "",
        phone_number: data.phone_number ?? "",
        package: data.package ?? "N/A", // null -> ""
        starting_date: (data.created_at || "").slice(0, 10), // "YYYY-MM-DD"
      });
    };
    fetchData();
  }, [isOpen]);
  const { register, handleSubmit, watch, setValue, reset } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = (data) => {
    console.log(data);
  };
  const logoFile: File | undefined = watch("company_logo")?.[0];
  return (
    <Dialog
      open={isOpen}
      onClose={() => close()}
      className="relative z-50 transition duration-300 ease-out data-[closed]:opacity-0"
      transition={true}
    >
      <DialogBackdrop className="fixed inset-0 bg-black/10" />

      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel className="w-full max-w-xl rounded-xl bg-sidebar/80 p-6 backdrop-blur-xl duration-300 ease-out data-[closed]:transform-[scale(95%)] data-[closed]:opacity-0">
            <div className="flex flex-col justify-center items-stretch">
              <div className=" text-black rounded-xl shadow-lg w-full max-w-xl">
                <h2 className="text-2xl mb-6 text-center text-primary-text">
                  Information
                </h2>
                <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
                  {/* <LabelInput
                    label="Customer Name"
                    inputProps={{
                      id: "customer_name",
                      placeholder: "Kawsar Hossain",
                      ...register("customer_name"),
                    }}
                  /> */}
                  <LabelInput
                    label="Restaurant Name"
                    inputProps={{
                      id: "restaurant_name",
                      readOnly: true,
                      ...register("restaurant_name"),
                    }}
                  />
                  <LabelInput
                    label="Location"
                    inputProps={{
                      id: "location",
                      readOnly: true,
                      ...register("location"),
                    }}
                  />
                  <LabelInput
                    label="Starting Date"
                    inputProps={{
                      id: "starting_date",
                      readOnly: true,
                      ...register("starting_date"),
                    }}
                  />
                  <LabelInput
                    label="Phone Number"
                    inputProps={{
                      id: "phone_number",
                      readOnly: true,
                      ...register("phone_number"),
                    }}
                  />

                  <LabelInput
                    label="Package"
                    inputProps={{
                      id: "package",
                      readOnly: true,
                      ...register("package"),
                    }}
                  />
                </form>
              </div>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
};
/* <<<<<<<<===================================================== Add Subscriber Modal */

/* Category Add/Edit Modal ===========================================================>>>>> */
type CategoryInputs = {
  name: string;
};

export const EditCategoryModal: React.FC<ModalProps> = ({
  isOpen,
  close,
  onSuccess,
}) => {
  const { fetchCategories } = useOwner();
  const { handleSubmit, register, reset } = useForm<CategoryInputs>();
  const [imageFile, setImageFile] = useState<File | null>(null);

  const onSubmit: SubmitHandler<CategoryInputs> = async (data) => {
    try {
      const formData = new FormData();
      formData.append("Category_name", data.name);
      if (imageFile) formData.append("image", imageFile);

      const response = await axiosInstance.post(
        "/owners/categories/",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );
      fetchCategories();
      console.log(response.data, "categories---------------");
      toast.success("Category Created successfully");
      reset();
      setImageFile(null);
      onSuccess();
      close();
      window.location.reload();
    } catch (error) {
      console.error("Failed:", error);
      toast.error("An error occurred");
    }
  };
  return (
    <Dialog
      open={isOpen}
      as="div"
      className="relative z-10 focus:outline-none"
      onClose={close}
    >
      <DialogBackdrop className="fixed inset-0 bg-black/90" />
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel
            transition
            className="w-full max-w-xl rounded-xl bg-sidebar/80 p-6 backdrop-blur-xl duration-300 ease-out data-[closed]:transform-[scale(95%)] data-[closed]:opacity-0"
          >
            <DialogTitle
              as="h3"
              className="text-base/7 font-medium text-white mb-8"
            >
              Add Category
            </DialogTitle>
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-col gap-y-4"
            >
              <LabelInput
                label="Category Name"
                labelProps={{
                  className: "text-sm",
                }}
                inputProps={{
                  className: "bg-[#201C3F] shadow-md text-sm",
                  ...register("name"),
                }}
              />

              <InputImageUploadBox file={imageFile} setFile={setImageFile} />
              <button className="button-primary" onClick={close}>
                Submit
              </button>
            </form>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
};

/* <<<<<<<<=====================================================  Category Add/Edit Modal */

/* SubCategory Add Modal ===========================================================>>>>> */
export const AddSubCategoryModal: React.FC<ModalProps> = ({
  isOpen,
  close,
  onSuccess,
}) => {
  type SubCategoryInputs = {
    name: string;
    parent_category: string;
  };
  const { fetchCategories, categories } = useOwner();
  const { handleSubmit, register, reset, watch } = useForm<SubCategoryInputs>();
  const [imageFile, setImageFile] = useState<File | null>(null);

  // Filter only main categories (no parent) for the dropdown
  const mainCategories = categories?.filter(c => !c.parent_category) || [];

  const onSubmit: SubmitHandler<SubCategoryInputs> = async (data) => {
    if (!data.parent_category) {
      toast.error("Please select a parent category");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("Category_name", data.name);
      formData.append("parent_category", data.parent_category);
      if (imageFile) formData.append("image", imageFile);

      const response = await axiosInstance.post(
        "/owners/subcategories/",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );
      fetchCategories();
      console.log(response.data, "subcategories---------------");
      toast.success("Sub-Category Created successfully");
      reset();
      setImageFile(null);
      if (onSuccess) onSuccess();
      close();
      window.location.reload();
    } catch (error) {
      console.error("Failed:", error);
      toast.error("An error occurred");
    }
  };

  return (
    <Dialog
      open={isOpen}
      as="div"
      className="relative z-10 focus:outline-none"
      onClose={close}
    >
      <DialogBackdrop className="fixed inset-0 bg-black/90" />
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel
            transition
            className="w-full max-w-xl rounded-xl bg-sidebar/80 p-6 backdrop-blur-xl duration-300 ease-out data-[closed]:transform-[scale(95%)] data-[closed]:opacity-0"
          >
            <DialogTitle
              as="h3"
              className="text-base/7 font-medium text-white mb-8"
            >
              Add Sub-Category
            </DialogTitle>
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-col gap-y-4"
            >
              <LabelInput
                label="Sub-Category Name"
                labelProps={{
                  className: "text-sm",
                }}
                inputProps={{
                  className: "bg-[#201C3F] shadow-md text-sm",
                  ...register("name", { required: true }),
                }}
              />

              <div className="flex flex-col gap-1">
                <label className="text-sm text-white">Parent Category <span className="text-red-500">*</span></label>
                <select
                  {...register("parent_category", { required: true })}
                  className="bg-[#201C3F] shadow-md text-sm w-full px-3 py-2 rounded-md text-white border-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Select Parent Category</option>
                  {mainCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.Category_name}
                    </option>
                  ))}
                </select>
              </div>

              <InputImageUploadBox file={imageFile} setFile={setImageFile} />
              <button className="button-primary" type="submit">
                Submit
              </button>
            </form>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
};
/* <<<<<<<<=====================================================  SubCategory Add Modal */

/* Device Add/Edit Modal ===========================================================>>>>> */
export const EditDeviceModal: React.FC<ModalProps> = ({ isOpen, close }) => {
  const [loading, setLoading] = useState(false);
  const [tableName, setTableName] = useState("");
  const [region, setRegion] = useState("");
  const { fetchAllDevices, fetchDeviceStats, devicesSearchQuery, devicesCurrentPage } =
    useOwner();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axiosInstance.post("/owners/devices/", {
        table_name: tableName,
        region: region || "Primary", // Default to "Primary" if empty
      });

      console.log("Response:", response.data);
      toast.success("Table added successfully!");

      // Refresh the devices list with current page and search query
      // Refresh the devices list with current page and search query
      await Promise.all([
        fetchAllDevices(devicesCurrentPage, devicesSearchQuery),
        fetchDeviceStats(),
      ]);

      // Reset form and close modal
      setTableName("");
      setRegion("");
      close();
    } catch (error) {
      console.error("Error adding table:", error);
      toast.error("Failed to add table.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      as="div"
      className="relative z-10 focus:outline-none"
      onClose={close}
    >
      <DialogBackdrop className="fixed inset-0 bg-black/30" />
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel
            transition
            className="w-full max-w-xl rounded-xl bg-sidebar/80 p-6 backdrop-blur-xl duration-300 ease-out data-[closed]:transform-[scale(95%)] data-[closed]:opacity-0"
          >
            <DialogTitle
              as="h3"
              className="text-base/7 font-medium text-white mb-8"
            >
              Add Table
            </DialogTitle>
            <form onSubmit={handleSubmit} className="flex flex-col gap-y-4">
              <LabelInput
                label="Name"
                labelProps={{
                  className: "text-sm",
                }}
                inputProps={{
                  className: "bg-[#201C3F] shadow-md text-sm text-white",
                  value: tableName,
                  onChange: (e) => setTableName(e.target.value),
                  required: true,
                  placeholder: "e.g. Table 1",
                }}
              />
              <LabelInput
                label="Area (Optional)"
                labelProps={{
                  className: "text-sm",
                }}
                inputProps={{
                  className: "bg-[#201C3F] shadow-md text-sm text-white",
                  value: region,
                  onChange: (e) => setRegion(e.target.value),
                  placeholder: "e.g. Patio (Default: Primary)",
                }}
              />

              <button
                type="submit"
                className="button-primary"
                disabled={loading}
              >
                {loading ? "Submitting..." : "Submit"}
              </button>
            </form>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
};

/* <<<<<<<<=====================================================  Device Add/Edit Modal  */

/* Edit staff ===========================================================>>>>> */
export const EditStaffModal: React.FC<ModalProps> = ({ isOpen, close }) => {
  type Inputs = {
    email: string;
    name: string;
    role: string;
  };
  const { register, handleSubmit, control } = useForm<Inputs>();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("email", data.email);
      formData.append("username", data.name);
      formData.append("role", data.role);
      console.log(formData, "formdata");
      if (imageFile) formData.append("image", imageFile);

      const response = await axiosInstance.post(
        "/owners/chef-staff/",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      toast.success(`${response.data?.role} Created successfully`);
      close();
      if (response.status == 400 || response.status == 500) {
        toast.error(response.data?.email || "An error occurred");
      }
    } catch (error) {
      console.error("Failed:", error);
      toast.error(error.response?.data?.email || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      as="div"
      className="relative z-10 focus:outline-none"
      onClose={close}
    >
      <DialogBackdrop className="fixed inset-0 bg-black/30" />
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel
            transition
            className="w-full max-w-xl rounded-xl bg-sidebar/80 p-6 backdrop-blur-xl duration-300 ease-out data-[closed]:transform-[scale(95%)] data-[closed]:opacity-0"
          >
            <DialogTitle
              as="h3"
              className="text-base/7 font-medium text-white mb-8"
            >
              Create Member
            </DialogTitle>
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-col gap-y-4"
            >
              <LabelInput
                label="Name"
                labelProps={{ className: "text-sm" }}
                inputProps={{
                  className: "bg-[#201C3F] shadow-md text-sm",
                  ...register("name"),
                }}
              />
              <LabelInput
                label="Email"
                labelProps={{ className: "text-sm" }}
                inputProps={{
                  className: "bg-[#201C3F] shadow-md text-sm",
                  ...register("email"),
                }}
              />
              {/* <LabelInput
                label="Role"
                labelProps={{ className: "text-sm" }}
                inputProps={{
                  className: "bg-[#201C3F] shadow-md text-sm",
                  ...register("role"),
                }}
              /> */}
              <label className="block text-sm font-medium text-gray-200">
                Role
                <select
                  {...register("role")}
                  className="mt-1 block w-full rounded-md bg-[#201C3F] text-white shadow-sm border border-gray-600 focus:border-indigo-500 focus:ring focus:ring-indigo-500 focus:ring-opacity-50 text-sm py-2 px-3"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select a role
                  </option>
                  <option value="staff">Staff</option>
                  <option value="chef">Chef</option>
                </select>
              </label>
              <InputImageUploadBox file={imageFile} setFile={setImageFile} />

              <button
                type="submit"
                className="button-primary"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex gap-3 items-center justify-center">
                    <ImSpinner6 className="animate-spin" /> Loading...
                  </span>
                ) : (
                  "Submit"
                )}
              </button>
            </form>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
};

/* <<<<<<<<=====================================================  EditStaffModal Modal  */

type AssistantCredentials = {
  TwilioNumber: string;
  TwilioSID: string;
  TwilioToken: string;
};

type AssistantModalProps = {
  isOpen: boolean;
  close: () => void;
  onSave: (data: any) => void;
  initialData?: Partial<AssistantCredentials> | null;
};

type ExistingAssistance = {
  twilio_number?: string | null;
  twilio_account_sid?: string | null; // usually hashed; we never show it
};

export const AssistantModal: React.FC<AssistantModalProps> = ({
  isOpen,
  close,
  onSave,
  initialData,
}) => {
  const { register, handleSubmit, reset, getValues } =
    useForm<AssistantCredentials>({
      defaultValues: {
        TwilioNumber: initialData?.TwilioNumber ?? "",
        TwilioSID: initialData?.TwilioSID ?? "",
        TwilioToken: initialData?.TwilioToken ?? "",
      },
    });

  const [loading, setLoading] = useState(false);
  const [existing, setExisting] = useState<ExistingAssistance | null>(null);

  // Fetch existing on open (404 = none yet)
  const fetchAssistant = async () => {
    setLoading(true);
    try {
      const res = await axiosInstance.get(
        "/owners/get-restaurant-assistance/",
        {
          validateStatus: (s) => s === 200 || s === 404,
        }
      );

      if (res.status === 404 || !res.data) {
        setExisting(null);
        reset({ TwilioNumber: "", TwilioSID: "", TwilioToken: "" });
        return;
      }
      console.log(res);
      const data = res.data as ExistingAssistance;
      setExisting(data);
      reset({
        TwilioNumber: data?.twilio_number || "",
        TwilioSID: "", // keep blank (server returns hashed)
        TwilioToken: "", // keep blank (server returns hashed)
      });
    } catch (e: any) {
      console.error("assistant GET error:", e?.response?.data || e);
      setExisting(null);
      reset({ TwilioNumber: "", TwilioSID: "", TwilioToken: "" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchAssistant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Submit logic
  const onSubmit = async (f: AssistantCredentials) => {
    setLoading(true);
    try {
      const number = (f.TwilioNumber || "").trim();
      const sid = (f.TwilioSID || "").trim();
      const token = (f.TwilioToken || "").trim();

      const hasExisting = !!(
        existing?.twilio_number || existing?.twilio_account_sid
      );
      const numberChanged = hasExisting && existing?.twilio_number !== number;
      const hasNewSid = sid.length > 0;
      const hasNewToken = token.length > 0;

      let res;

      if (!hasExisting) {
        // brand new → must provide all three
        res = await axiosInstance.post("/owners/create-assistant/", {
          twilio_number: number,
          twilio_account_sid: sid,
          twilio_auth_token: token,
        });
      } else if (hasNewSid || hasNewToken) {
        // replacing creds → require both SID & Token for safety
        if (!hasNewSid || !hasNewToken) {
          console.error(
            "Provide BOTH a new SID and a new Token to replace credentials."
          );
          setLoading(false);
          return;
        }
        res = await axiosInstance.post("/owners/create-assistant/", {
          twilio_number: number,
          twilio_account_sid: sid,
          twilio_auth_token: token,
        });
        console.log(res);
        if (res.status === 201) {
          toast.success("Assistant created successfully");
        }
      } else if (numberChanged) {
        // only number changed
        res = await axiosInstance.patch("/owners/update-assistant-number/", {
          twilio_number: number,
          twilio_account_sid: sid,
          twilio_auth_token: token,
        });
        console.log(res);
      } else {
        // nothing changed
        close();
        return;
      }

      console.log("assistant saved:", res.data);
      onSave(res.data);
      close();
    } catch (err: any) {
      console.error("assistant save error:", err?.response?.data || err);
    } finally {
      setLoading(false);
    }
  };

  const isEdit = Boolean(existing);

  return (
    <Dialog
      open={isOpen}
      as="div"
      className="relative z-10"
      onClose={loading ? () => { } : close}
    >
      <DialogBackdrop className="fixed inset-0 bg-black/30" />
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-xl bg-sidebar/80 p-6 backdrop-blur-xl">
            <DialogTitle className="text-base font-medium text-white mb-8">
              {isEdit ? "Edit Assistant" : "Add Assistant"}
            </DialogTitle>

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-col gap-y-4"
            >
              <LabelInput
                inputType="number"
                label="Twilio Number"
                inputProps={{
                  className:
                    "bg-[#201C3F] shadow-md text-sm appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]",
                  ...register("TwilioNumber", {
                    required: true,
                    maxLength: 20,
                  }),
                  placeholder: "+12315154894",
                }}
              />

              <LabelInput
                label="Twilio Account SID"
                inputProps={{
                  className: "bg-[#201C3F] shadow-md text-sm",
                  ...register("TwilioSID", { required: !isEdit }),
                  placeholder: isEdit
                    ? "(enter new to replace)"
                    : "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
                }}
              />

              <LabelInput
                label="Twilio Auth Token"
                inputProps={{
                  type: "password",
                  className: "bg-[#201C3F] shadow-md text-sm",
                  ...register("TwilioToken", { required: !isEdit }),
                  placeholder: isEdit
                    ? "(enter new to replace)"
                    : "Your auth token",
                }}
              />

              {isEdit && (
                <small className="text-gray-400">
                  SID/Token are already configured (hidden). Enter new values to
                  replace them, or leave blank to just update the number.
                </small>
              )}

              <div className="flex justify-end gap-x-2 mt-4">
                <button
                  type="button"
                  onClick={close}
                  className="px-4 py-2 text-primary-text border border-primary-text rounded-md hover:bg-primary-text hover:text-primary disabled:opacity-50"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button-primary px-8 py-2 text-primary-text disabled:opacity-50"
                  disabled={loading}
                >
                  {loading ? "Saving..." : isEdit ? "Update" : "Add"}
                </button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
};

// import {
//   Dialog,
//   DialogBackdrop,
//   DialogPanel,
//   DialogTitle,
// } from "@headlessui/react";

type TAssistantModalProps = {
  isOpen: boolean;
  close: () => void;
};

type AssistantFormData = {
  TwilioNumber: number;
  TwilioSID: string;
  TwilioToken: string;
};

export const NewAssistantModal: React.FC<TAssistantModalProps> = ({
  isOpen,
  close,
}) => {
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { isSubmitting },
  } = useForm<AssistantFormData>({
    defaultValues: {
      TwilioNumber: 0,
      TwilioSID: "",
      TwilioToken: "",
    },
  });
  const [hasData, setHasData] = useState(false);
  const [inputdata, setInputdata] = useState();
  useEffect(() => {
    const fetchNumber = async () => {
      try {
        const res = await axiosInstance.get(
          "/owners/get-restaurant-assistance/"
        );
        if (res.data) {
          reset({
            TwilioNumber: res.data.twilio_number || "",
            TwilioSID: res.data.twilio_account_sid || "",
            TwilioToken: res.data.twilio_auth_token || "",
          });
          console.log();
          setHasData(true); // data exists → show "Update"
        } else {
          setHasData(false); // no data → show "Add"
        }
      } catch (error: any) {
        console.error(error);
        setHasData(false);
      }
    };

    fetchNumber();
  }, [reset]);

  const onSubmit = async (data: AssistantFormData) => {
    try {
      console.log(data);
      const res = await axiosInstance.post("/owners/create-assistant/", {
        twilio_number: data.TwilioNumber,
        twilio_account_sid: data.TwilioSID,
        twilio_auth_token: data.TwilioToken,
      });
      if (res.status === 201) {
        toast.success("Assistant created successfully");
      } else {
        toast.error("Error creating assistant");
      }
      console.log(res);
      setInputdata(res?.data);
      reset();
      close();
    } catch (err: any) {
      console.log(err)
      toast.error(err?.response?.data.error)
      toast.error(err?.response?.data?.non_field_errors[0]);
      console.error("Error creating assistant:", err?.response?.data || err);
    }
  };
  const handleUpdate = async (data: AssistantFormData) => {
    try {
      const res = await axiosInstance.patch(
        "/owners/update-assistant-number/",
        {
          twilio_number: data.TwilioNumber,
          twilio_account_sid: data.TwilioSID,
          twilio_auth_token: data.TwilioToken,
        }
      );
      console.log();
      if (res.status === 200) {
        toast.success("Assistant updated successfully");
        reset();
        close();
      } else {
        toast.error("Error updating assistant");
      }
    } catch (err: any) {
      console.error("Error updating assistant:", err.response?.data || err);
      toast.error("Error updating assistant");
    }
  };

  return (
    <Dialog open={isOpen} as="div" className="relative z-10" onClose={close}>
      <DialogBackdrop className="fixed inset-0 bg-black/30" />
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-xl bg-sidebar/80 p-6 backdrop-blur-xl">
            <DialogTitle className="text-base font-medium text-white mb-8">
              Add Assistant
            </DialogTitle>

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-col gap-y-4"
            >
              {/* Twilio Number with Country Code */}
              <div className="phone-input-container">
                <Controller
                  name="TwilioNumber"
                  control={control}
                  rules={{ required: true }}
                  render={({ field }) => (
                    <PhoneInput
                      defaultCountry="US"
                      value={field.value ? String(field.value) : ""}
                      onChange={field.onChange}
                      className="w-full"
                    />
                  )}
                />
              </div>
              {/* Twilio Account SID */}
              <div className="flex flex-col gap-1">
                <label className="text-sm text-white">Twilio Account SID</label>
                <input
                  type="text"
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="bg-[#201C3F] shadow-md text-sm px-3 py-2 rounded-md text-white"
                  {...register("TwilioSID", { required: true })}
                />
              </div>

              {/* Twilio Auth Token */}
              <div className="flex flex-col gap-1">
                <label className="text-sm text-white">Twilio Auth Token</label>
                <input
                  type="password"
                  placeholder="Your auth token"
                  className="bg-[#201C3F] shadow-md text-sm px-3 py-2 rounded-md text-white"
                  {...register("TwilioToken", { required: true })}
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-x-2 mt-4">
                {hasData ? (
                  <button
                    type="button"
                    onClick={handleSubmit(handleUpdate)} // custom update function
                    className="button-primary px-8 py-2 text-primary-text"
                  >
                    {isSubmitting ? "Loading..." : "Update"}
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="button-primary px-8 py-2 text-primary-text"
                  >
                    {isSubmitting ? "Loading..." : "Add"}
                  </button>
                )}
              </div>
            </form>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
};



