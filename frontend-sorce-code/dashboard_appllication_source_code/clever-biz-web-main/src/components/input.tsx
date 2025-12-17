import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  Popover,
  PopoverButton,
  PopoverPanel,
  Transition,
} from "@headlessui/react";
import { cn } from "clsx-for-tailwind";
import { AnimatePresence, motion } from "motion/react";
import { Fragment, HTMLAttributes, useEffect, useRef, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { AiFillCaretDown, AiFillEye, AiFillEyeInvisible } from "react-icons/ai";
import { BiTrash } from "react-icons/bi";
import { FaCalendarDays, FaMagnifyingGlass } from "react-icons/fa6";
import { FiFilter, FiUpload, FiX, FiVideo } from "react-icons/fi";
import { IoMdAdd } from "react-icons/io";
import { IoAdd, IoChevronDown } from "react-icons/io5";

/* Input field with label >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> */
type LabelInputProps = {
  icon?: React.ReactNode;
  label?: string;
  inputType?: "text" | "password" | "email" | "number" | "tel" | "url" | "search";
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  labelProps?: React.LabelHTMLAttributes<HTMLLabelElement>;
  containerProps?: React.HTMLAttributes<HTMLDivElement>;
  placeholder?: string | undefined | null | false | number;
};

export const LabelInput: React.FC<LabelInputProps> = ({
  label = "Label",
  inputProps = {},
  labelProps = {},
  containerProps = {},
  placeholder = "",
  icon,
  inputType = "text", // 👈 default type
}: LabelInputProps) => {
  const id = inputProps.id;
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = inputType === "password";

  const toggleVisibility = () => {
    setShowPassword((prev) => !prev);
  };

  const { className: labelClassName, ...remainLabel } = labelProps;
  const { className, ...remain } = inputProps;

  return (
    <div {...containerProps}>
      <label
        htmlFor={id}
        className={cn(
          "font-poppins block text-sm text-primary-text",
          labelClassName
        )}
        {...remainLabel}
      >
        {label}
      </label>
      <div className="relative mt-1">
        <input
          type={isPassword ? (showPassword ? "text" : "password") : inputType}
          id={id}
          className={cn(
            "w-full p-3 bg-input text-primary-text font-poppins placeholder:font-poppins placeholder:text-input-placeholder rounded-md focus:outline-none focus:ring-0",
            {
              "ps-11": icon != undefined,
              "pe-11": isPassword, // add right padding if toggle is shown
            },
            className
          )}
          placeholder={inputProps.placeholder || label}
          {...remain}
        />
        {icon && (
          <span className="absolute h-6 w-6 *:h-6 *:w-6 *:text-primary-text left-3 top-1/2 -translate-y-1/2 flex justify-center items-center">
            {icon}
          </span>
        )}
        {isPassword && (
          <span
            onClick={toggleVisibility}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-primary-text/50 cursor-pointer select-none"
          >
            {showPassword ? (
              <AiFillEyeInvisible className="h-6 w-6" />
            ) : (
              <AiFillEye className="h-6 w-6" />
            )}
          </span>
        )}
      </div>
    </div>
  );
};
export const DateInput: React.FC<LabelInputProps> = ({
  label = "Label",
  inputProps = {},
  labelProps = {},
  containerProps = {},
  icon,
  inputType = "text",
}: LabelInputProps) => {
  const id = inputProps.id;

  const { className: labelClassName, ...remainLabel } = labelProps;
  const { className, ...remain } = inputProps;
  // const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  return (
    <div>
      <p
        className={cn(
          "font-poppins block text-sm text-primary-text",
          labelClassName
        )}
      >
        {label}
      </p>
      <Popover className="relative">
        {({ open }) => (
          <>
            <div className="mt-1 h-12 w-full flex items-center bg-input text-primary-text rounded-lg overflow-hidden shadow-md">
              <PopoverButton className="flex items-center w-full px-4 py-2 text-left focus:outline-none">
                <span className="text-sm text-primary-text/70 leading-none">
                  {selectedDate ? selectedDate.toDateString() : "1/12/2025"}
                </span>
              </PopoverButton>
            </div>

            <AnimatePresence>
              {open && (
                <PopoverPanel static>
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute z-10 mt-2 bg-[#1F1D3B] text-white p-4 rounded-lg shadow-lg"
                  >
                    <DatePicker
                      selected={selectedDate}
                      onSelect={(date) => setSelectedDate(date)}
                      inline
                      calendarClassName="!bg-[#1F1D3B] !text-white"
                      dayClassName={() => "hover:bg-[#292758]"}
                    />
                  </motion.div>
                </PopoverPanel>
              )}
            </AnimatePresence>
          </>
        )}
      </Popover>
    </div>
  );
};
/* <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<  Input field with label */
/* Text area field with label ===========================================================>>>>> */
type LabelTextareaProps = {
  label?: string;
  textareaProps?: React.TextareaHTMLAttributes<HTMLTextAreaElement>;
  labelProps?: React.LabelHTMLAttributes<HTMLLabelElement>;
  containerProps?: React.HTMLAttributes<HTMLDivElement>;
  icon?: React.ReactNode;
};

export const LabelTextarea: React.FC<LabelTextareaProps> = ({
  label = "Label",
  textareaProps = {},
  labelProps = {},
  containerProps = {},
  icon,
}) => {
  const id = textareaProps.id;

  const { className: labelClassName, ...remainLabel } = labelProps;
  const { className, ...remain } = textareaProps;
  return (
    <div {...containerProps}>
      <label
        htmlFor={id}
        className={cn(
          "font-poppins block text-sm text-primary-text mb-1",
          labelClassName
        )}
        {...remainLabel}
      >
        {label}
      </label>
      <div className="relative">
        <textarea
          id={id}
          rows={4}
          className={cn(
            "w-full p-3 bg-input text-primary-text font-poppins placeholder:font-poppins placeholder:text-input-placeholder rounded-md resize-y focus:outline-none focus:ring-0 focus:ring-accent",
            {
              "ps-11": icon != undefined,
            },
            className
          )}
          placeholder={textareaProps.placeholder || label}
          {...remain}
        />
        {icon && (
          <span className="absolute h-6 w-6 *:h-6 *:w-6 *:text-primary-text left-3 top-3 flex justify-center items-center">
            {icon}
          </span>
        )}
      </div>
    </div>
  );
};
/* <<<<<<<<===================================================== Text area field with label */
/* Pick Conpany Logo Input ===========================================================>>>>> */
type PickCompanyLogoProps = LabelInputProps & {
  file?: File | null;
  removeFile: () => void;
};
export const PickCompanyLogo: React.FC<PickCompanyLogoProps> = ({
  label = "Label",
  inputProps = {},
  labelProps = {},
  containerProps = {},
  file,
  removeFile,
}) => {
  const id = inputProps.id;

  // const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  //   const file = e.target.files?.[0];
  //   console.log(file);
  //   if (file) {
  //     setPreviewUrl(URL.createObjectURL(file));
  //   }
  // };
  const previewUrl = file && URL.createObjectURL(file);
  return (
    <div className="flex items-center space-x-4" {...containerProps}>
      {/* Left column - Label */}
      <label
        className="flex-1 font-poppins block text-sm text-primary-text"
        htmlFor={id}
        {...labelProps}
      >
        {label}
      </label>

      {/* Right column - Image Preview or Plus Icon */}
      <div className="flex-1">
        <label
          htmlFor={id}
          className="flex justify-center items-center w-24 h-24 rounded-lg border border-dashed border-gray-500 cursor-pointer overflow-hidden"
          {...labelProps}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Preview"
              className="object-cover w-full h-full"
            />
          ) : (
            <IoAdd className="text-gray-400 w-8 h-8" />
          )}
        </label>
        <input
          type="file"
          id={id}
          accept="image/*"
          className="hidden"
          {...inputProps}
        />
      </div>

      <div className="flex-1 flex justify-center items-center">
        {previewUrl && (
          <BiTrash
            className="h-6 w-6 cursor-pointer text-red-500"
            onClick={removeFile}
          />
        )}
      </div>
    </div>
  );
};
/* <<<<<<<<===================================================== Pick Conpany Logo Input */
/* Input Drop Down ===========================================================>>>>> */
type DashboardDropDownProps = {
  options: string[];
};
export const DashboardDropDown: React.FC<DashboardDropDownProps> = ({
  options,
}) => {
  const [selected, setSelected] = useState(options[0]);

  return (
    <div className="w-72 h-14">
      <Listbox value={selected} onChange={setSelected}>
        {({ open }) => (
          <div className="w-full h-full relative">
            {/* Button */}
            <ListboxButton className="h-14 min-w-14 relative ms-auto flex justify-between w-13 md:w-full bg-sidebar cursor-pointer rounded-lg shadow-black/70 py-3 md:ps-6 md:pe-10 text-left text-white shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75">
              {/* Large screen label */}
              <span className="hidden truncate md:block my-auto text-primary-text">
                {selected}
              </span>

              {/* Mobile: Show filter icon instead of text */}
              <span className="w-full flex justify-center self-end items-center md:hidden my-auto">
                <FiFilter className="w-5 h-5 text-primary-text" />
              </span>

              {/* Chevron */}
              <span className="hidden pointer-events-none absolute inset-y-0 right-0 md:flex items-center pr-4">
                <IoChevronDown
                  className="h-5 w-5 text-primary-text"
                  aria-hidden="true"
                />
              </span>

              {/* Badge: only show if filter applied (not default) */}
              {selected !== options[0] && (
                <span className="md:hidden absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-green-400 ring-2 ring-[#16142A] md:right-4" />
              )}
            </ListboxButton>

            {/* Dropdown Panel */}
            <Transition
              as={Fragment}
              show={open}
              enter="transition ease-out duration-100"
              leave="transition ease-in duration-75"
            >
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute mt-2 w-full overflow-hidden rounded-md bg-[#1F1D38] py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none z-20"
              >
                <ListboxOptions static>
                  {options.map((category, idx) => (
                    <ListboxOption
                      key={idx}
                      className={({ selected }) =>
                        `relative cursor-pointer select-none py-2 px-4 ${selected
                          ? "bg-[#2C2A4C] text-primary-text"
                          : " text-primary-text/70"
                        }`
                      }
                      value={category}
                    >
                      {({ selected }) => (
                        <span
                          className={`block truncate ${selected ? "font-medium" : "font-normal"
                            }`}
                        >
                          {category}
                        </span>
                      )}
                    </ListboxOption>
                  ))}
                </ListboxOptions>
              </motion.div>
            </Transition>
          </div>
        )}
      </Listbox>
    </div>
  );
};

/* <<<<<<<<===================================================== Input Drop Down */
/* Upload pickable item ===========================================================>>>>> */
// InputImageUploadBox.tsx
import { ImSpinner6 } from "react-icons/im";
import { FaMagic } from "react-icons/fa";

type Props = {
  file: File | null;
  setFile: (file: File | null) => void;
  label?: string;
  searchQuery?: string; // New prop for auto-generation
};

export const InputImageUploadBox: React.FC<Props> = ({ file, setFile, label = "Upload image", searchQuery }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleClick = () => inputRef.current?.click();

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) setFile(droppedFile);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  };

  const handleRemoveImage = () => {
    setFile(null);
    setPreviewUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleAutoGenerate = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!searchQuery) return;

    setIsGenerating(true);
    try {
      const prompt = `${searchQuery} food high quality delicious professional photography`;
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;

      const response = await fetch(url);
      const blob = await response.blob();
      const generatedFile = new File([blob], `${searchQuery.replace(/\s+/g, "_")}_generated.jpg`, { type: "image/jpeg" });

      setFile(generatedFile);
    } catch (error) {
      console.error("Failed to generate image:", error);
      // You might want to show a toast here if you have access to it
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <label className="block text-primary-text text-sm font-medium">
          {label}
        </label>
        {searchQuery && !file && (
          <button
            onClick={handleAutoGenerate}
            disabled={isGenerating}
            type="button"
            className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <ImSpinner6 className="animate-spin" /> Generating...
              </>
            ) : (
              <>
                <FaMagic /> Auto-Generate
              </>
            )}
          </button>
        )}
      </div>

      {previewUrl ? (
        <div className="relative mt-4 inline-block">
          <img
            src={previewUrl}
            alt="Preview"
            className="rounded-md max-h-60 object-contain border border-gray-600"
          />
          <button
            onClick={handleRemoveImage}
            className="absolute top-1 right-1 p-1 bg-black bg-opacity-60 text-white rounded-full"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          onClick={handleClick}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`w-full cursor-pointer rounded-lg border-2 border-dashed ${dragActive ? "border-accent" : "border-transparent"
            } bg-[#201C3F] p-8 text-center`}
        >
          <input
            type="file"
            accept="image/*"
            ref={inputRef}
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="text-primary-text">
            <FiUpload className="text-2xl mb-2 mx-auto" />
            <p className="font-semibold">Upload a File</p>
            <p className="text-sm text-primary-text/40">
              Drag and drop files here or{" "}
              <span className="underline">browse</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

/* <<<<<<<<===================================================== Upload pickable item */
/* Pick Video ===========================================================>>>>> */
type InputVideoUploadBoxProps = {
  file: File | null;
  setFile: (file: File) => void;
};

export const InputVideoUploadBox: React.FC<InputVideoUploadBoxProps> = ({
  file,
  setFile,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  const handleClick = () => inputRef.current?.click();

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      // Validate file type
      const validVideoTypes = [
        "video/mp4",
        "video/mov",
        "video/avi",
        "video/wmv",
        "video/flv",
        "video/webm",
        "video/mkv",
        "video/m4v",
        "video/3gp",
        "video/ogv",
        "video/ts",
        "video/mts",
        "video/m2ts",
      ];

      const isValidVideo =
        validVideoTypes.includes(file.type) ||
        file.name
          .toLowerCase()
          .match(/\.(mp4|mov|avi|wmv|flv|webm|mkv|m4v|3gp|ogv|ts|mts|m2ts)$/);

      if (isValidVideo) {
        setFile(file);
      } else {
        alert(
          "Please select a valid video file (MP4, MOV, AVI, WMV, FLV, WebM, MKV, M4V, 3GP, OGV, TS, MTS, M2TS)"
        );
        if (inputRef.current) inputRef.current.value = "";
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validVideoTypes = [
        "video/mp4",
        "video/mov",
        "video/avi",
        "video/wmv",
        "video/flv",
        "video/webm",
        "video/mkv",
        "video/m4v",
        "video/3gp",
        "video/ogv",
        "video/ts",
        "video/mts",
        "video/m2ts",
      ];

      const isValidVideo =
        validVideoTypes.includes(file.type) ||
        file.name
          .toLowerCase()
          .match(/\.(mp4|mov|avi|wmv|flv|webm|mkv|m4v|3gp|ogv|ts|mts|m2ts)$/);

      if (isValidVideo) {
        setFile(file);
      } else {
        alert(
          "Please select a valid video file (MP4, MOV, AVI, WMV, FLV, WebM, MKV, M4V, 3GP, OGV, TS, MTS, M2TS)"
        );
        if (inputRef.current) inputRef.current.value = "";
      }
    }
  };

  const handleRemoveVideo = () => {
    setFile(null);
    setThumbnailUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  useEffect(() => {
    if (!file) return;

    const video = document.createElement("video");
    const fileURL = URL.createObjectURL(file);
    video.src = fileURL;
    video.preload = "metadata";
    video.crossOrigin = "anonymous";

    const handleLoadedMetadata = () => {
      try {
        const middleFrame = Math.max(video.duration / 2, 0.1);
        video.currentTime = middleFrame;
      } catch (error) {
        console.error("Error setting video time:", error);
        // Fallback: try to get thumbnail from first frame
        video.currentTime = 0;
      }
    };

    const handleSeeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 240;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumbnail = canvas.toDataURL("image/png");
          setThumbnailUrl(thumbnail);
        }
      } catch (error) {
        console.error("Error generating thumbnail:", error);
        // Fallback: create a placeholder thumbnail
        setThumbnailUrl(null);
      } finally {
        URL.revokeObjectURL(fileURL);
      }
    };

    const handleError = (err: Event) => {
      console.error("Video load error:", err);
      console.log("File type:", file.type);
      console.log("File name:", file.name);
      URL.revokeObjectURL(fileURL);
      // Even if thumbnail generation fails, still allow the file to be uploaded
      setThumbnailUrl(null);
    };

    const handleCanPlay = () => {
      // Video can play, try to generate thumbnail
      if (video.readyState >= 2) {
        handleSeeked();
      }
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("seeked", handleSeeked);
    video.addEventListener("error", handleError);
    video.addEventListener("canplay", handleCanPlay);

    // Timeout fallback in case video doesn't load properly
    const timeout = setTimeout(() => {
      if (!thumbnailUrl) {
        console.log(
          "Video processing timeout, allowing upload without thumbnail"
        );
        URL.revokeObjectURL(fileURL);
        setThumbnailUrl(null);
      }
    }, 5000);

    return () => {
      clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
      video.removeEventListener("canplay", handleCanPlay);
    };
  }, [file]);

  return (
    <div className="space-y-4">
      <label className="block text-primary-text text-sm font-medium">
        Upload video
      </label>

      {thumbnailUrl && (
        <div className="relative mt-4 inline-block">
          <img
            src={thumbnailUrl}
            alt="Video thumbnail"
            className="rounded-md max-h-60 object-contain border border-gray-600"
          />
          <button
            onClick={handleRemoveVideo}
            className="absolute top-1 right-1 p-1 bg-black bg-opacity-60 text-white rounded-full hover:bg-opacity-80 transition"
            aria-label="Remove video"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>
      )}

      {file && !thumbnailUrl && (
        <div className="relative mt-4 inline-block">
          <div className="rounded-md max-h-60 w-80 h-40 bg-gray-800 border border-gray-600 flex items-center justify-center">
            <div className="text-center">
              <FiVideo className="text-4xl text-gray-400 mb-2" />
              <p className="text-sm text-gray-300">{file.name}</p>
              <p className="text-xs text-gray-500">
                Video uploaded successfully
              </p>
            </div>
          </div>
          <button
            onClick={handleRemoveVideo}
            className="absolute top-1 right-1 p-1 bg-black bg-opacity-60 text-white rounded-full hover:bg-opacity-80 transition"
            aria-label="Remove video"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>
      )}

      {!file && (
        <div
          onClick={handleClick}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`w-full cursor-pointer rounded-lg border-2 border-dashed ${dragActive ? "border-accent" : "border-transparent"
            } bg-[#201C3F] p-8 text-center transition duration-200`}
        >
          <input
            type="file"
            accept="video/*,.mov,.avi,.wmv,.flv,.webm,.mkv,.m4v,.3gp,.ogv,.ts,.mts,.m2ts"
            ref={inputRef}
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="flex flex-col justify-center items-center text-primary-text">
            <FiUpload className="text-primary-text text-2xl mb-2" />
            <p className="font-semibold">Upload a Video</p>
            <p className="text-sm text-primary-text/40">
              Drag and drop videos here or{" "}
              <span className="underline">browse</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
/* <<<<<<<<===================================================== Pick Video */

/* Date picker input ===========================================================>>>>> */
export const DateSearchBox = ({
  onDateChange,
}: {
  onDateChange?: (date: Date | null) => void;
}) => {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    onDateChange?.(date);
  };

  const handleSearch = () => {
    onDateChange?.(selectedDate);
  };

  return (
    <div className="w-full max-w-sm max-h-14">
      <Popover className="relative">
        {({ open }) => (
          <>
            <div className="h-14 flex items-center bg-sidebar text-primary-text rounded-lg overflow-hidden shadow-md">
              <PopoverButton className="flex items-center w-full px-4 py-2 text-left focus:outline-none">
                <FaCalendarDays className="w-5 h-5 mr-2 text-primary-text" />
                <span className="text-sm text-primary-text/70 leading-none">
                  {selectedDate
                    ? selectedDate.toDateString()
                    : "Search by Date"}
                </span>
              </PopoverButton>
              <button
                className="h-full bg-table-header px-6 flex items-center justify-center hover:bg-[#2B274D]"
                onClick={handleSearch}
              >
                <FaMagnifyingGlass className="w-4 h-4  text-primary-text" />
              </button>
            </div>

            <AnimatePresence>
              {open && (
                <PopoverPanel static>
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute z-10 mt-2 bg-[#1F1D3B] text-white p-4 rounded-lg shadow-lg"
                  >
                    <DatePicker
                      selected={selectedDate}
                      onSelect={handleDateSelect}
                      inline
                      calendarClassName="!bg-[#1F1D3B] !text-white"
                      dayClassName={() => "hover:bg-[#292758]"}
                    />
                  </motion.div>
                </PopoverPanel>
              )}
            </AnimatePresence>
          </>
        )}
      </Popover>
    </div>
  );
};
/* <<<<<<<<===================================================== Date picker input */

/* Text Search Box ===========================================================>>>>> */
interface TextSearchBoxProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  inputContainerClassName?: string;
  buttonClassName?: string;
}
export const TextSearchBox = ({
  placeholder = "Search...",
  className,
  value = "",
  onChange,
  inputContainerClassName,
  buttonClassName,
}: TextSearchBoxProps) => {
  const [internalValue, setInternalValue] = useState(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInternalValue(newValue);
    onChange?.(newValue);
  };

  // Update internal value when prop changes
  useEffect(() => {
    setInternalValue(value);
  }, [value]);

  return (
    <div className={cn("w-full max-w-sm h-14", className)}>
      <div className={cn("h-14 flex items-center bg-sidebar text-primary-text rounded-lg overflow-hidden shadow-md", inputContainerClassName)}>
        <input
          type="text"
          value={internalValue}
          onChange={handleChange}
          placeholder={placeholder}
          className="w-full h-full px-4 text-sm bg-transparent text-inherit placeholder:text-inherit focus:outline-none"
        />
        <button className={cn("h-full bg-table-header px-6 flex items-center justify-center hover:bg-[#2B274D]", buttonClassName)}>
          <FaMagnifyingGlass className="w-4 h-4 text-inherit" />
        </button>
      </div>
    </div>
  );
};
/* <<<<<<<<===================================================== Text Search Box */
interface TextSearchBoxCompactProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  className?: string;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
}
export const TextSearchBoxCompact: React.FC<TextSearchBoxCompactProps> = ({
  className,
  placeholder = "Search...",
  value = "",
  onChange,
}) => {
  const [internalValue, setInternalValue] = useState(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInternalValue(newValue);
    onChange?.(newValue);
  };

  // Update internal value when prop changes
  useEffect(() => {
    setInternalValue(value);
  }, [value]);

  return (
    <div className="w-full max-w-sm">
      <div
        className={cn(
          "h-14 flex items-center bg-sidebar text-primary-text rounded-lg overflow-hidden shadow-md",
          className
        )}
      >
        <FaMagnifyingGlass className="ms-4 w-4 h-4 text-primary-text" />
        <input
          type="text"
          value={internalValue}
          onChange={handleChange}
          placeholder={placeholder}
          className="w-full h-full px-4 text-sm bg-transparent text-primary-text placeholder:text-primary-text/70 focus:outline-none"
        />
      </div>
    </div>
  );
};

/* Status Button ===========================================================>>>>> */

interface ButtonStatusProps<StatusType extends string> {
  readonly?: boolean;
  status: StatusType;
  properties: Record<StatusType, { bg: string; text: string }>;
  availableStatuses?: StatusType[];
  onChange?: (newStatus: StatusType) => void;
  disabled?: boolean;
}

export const ButtonStatus = <StatusType extends string>({
  readonly = false,
  status,
  properties,
  availableStatuses = [],
  onChange,
  disabled = false,
}: ButtonStatusProps<StatusType>) => {
  const colors = properties[status] || {
    bg: "bg-gray-800",
    text: "text-gray-300",
  };

  if (readonly) {
    return (
      <span
        className={cn(
          "inline-flex justify-center items-center gap-x-2 px-3 py-1 rounded-md text-sm font-medium cursor-default",
          colors.bg,
          colors.text
        )}
      >
        {status}
      </span>
    );
  }

  return (
    <Menu as="div" className="relative inline-block text-left">
      <MenuButton
        className={cn(
          "inline-flex justify-center items-center gap-x-2 px-3 py-1 rounded-md text-sm font-medium cursor-pointer",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
          colors.bg,
          colors.text
        )}
      >
        {status}
        <AiFillCaretDown className="w-4 h-4" />
      </MenuButton>

      <MenuItems className="absolute bg-dashboard left-0 mt-2 min-w-40 rounded-md shadow-lg z-50 p-2">
        {availableStatuses?.map((value) => (
          <MenuItem key={value}>
            <button
              onClick={() => onChange?.(value)}
              className={cn(
                "w-full text-left px-6 py-2 text-sm text-primary-text hover:bg-sidebar",
                disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-sidebar"
              )}
            >
              {value}
            </button>
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  );
};
export const StatusSpan = <StatusType extends string>({
  status,
  properties,
  onClick,
  readonly,
}: ButtonStatusProps<StatusType> & { onClick?: () => void }) => {
  const colors = properties[status] || {
    bg: "bg-gray-800",
    text: "text-gray-300",
  };
  return (
    <span
      onClick={() => {
        if (!readonly) {
          onClick?.();
        }
      }}
      className={`inline-flex justify-center items-center gap-x-2 px-3 py-1 rounded-md text-sm font-medium cursor-default ${colors.bg} ${colors.text} cursor-pointer`}
    >
      {status}
    </span>
  );
};
/* <<<<<<<<===================================================== Status Button */

/* Add Button ===========================================================>>>>> */

export const ButtonAdd = ({
  label,
  onClick,
  className,
}: {
  label: string;
  className?: string;
  onClick: () => void;
}) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        "button-primary bg-sidebar text-nowrap flex flex-row justify-center items-center h-14 gap-x-4",
        className
      )}
    >
      <IoMdAdd /> <span>{label}</span>
    </button>
  );
};

/* <<<<<<<<===================================================== Add Button */
