import { AnimatePresence, motion } from "motion/react";
import React, { createContext, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Types
interface SheetContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SheetProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
}

interface SheetTriggerProps {
  children: React.ReactNode;
  asChild?: boolean;
  className?: string;
  onClick?: () => void;
}

interface SheetContentProps {
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onPointerDownOutside?: (event: PointerEvent) => void;
}

interface SheetOverlayProps {
  className?: string;
}

interface SheetHeaderProps {
  children: React.ReactNode;
  className?: string;
}

interface SheetTitleProps {
  children: React.ReactNode;
  className?: string;
}

interface SheetDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

interface SheetCloseProps {
  children: React.ReactNode;
  className?: string;
  asChild?: boolean;
}

// Context
const SheetContext = createContext<SheetContextValue | undefined>(undefined);

const useSheet = () => {
  const context = useContext(SheetContext);
  if (!context) {
    throw new Error("Sheet components must be used within a Sheet");
  }
  return context;
};

// Animation variants
const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const contentVariants = {
  top: {
    hidden: { y: "-100%" },
    visible: { y: 0 },
  },
  right: {
    hidden: { x: "100%" },
    visible: { x: 0 },
  },
  bottom: {
    hidden: { y: "100%" },
    visible: { y: 0 },
  },
  left: {
    hidden: { x: "-100%" },
    visible: { x: 0 },
  },
};

// Root component
const Sheet: React.FC<SheetProps> = ({
  children,
  open: controlledOpen,
  onOpenChange,
  defaultOpen = false,
}) => {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const handleOpenChange = (newOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  };

  return (
    <SheetContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      {children}
    </SheetContext.Provider>
  );
};

// Trigger component
const SheetTrigger: React.FC<SheetTriggerProps> = ({
  children,
  asChild = false,
  className = "",
  onClick,
}) => {
  const { onOpenChange } = useSheet();

  const handleClick = () => {
    onOpenChange(true);
    onClick?.();
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      onClick: handleClick,
      className: `${
        (children.props as any).className || ""
      } ${className}`.trim(),
      "data-state": "closed",
    });
  }

  return (
    <button
      onClick={handleClick}
      className={className}
      data-state="closed"
      type="button"
    >
      {children}
    </button>
  );
};

// Portal component
const SheetPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return createPortal(children, document.body);
};

// Overlay component
const SheetOverlay: React.FC<SheetOverlayProps> = ({ className = "" }) => {
  const { onOpenChange } = useSheet();

  return (
    <motion.div
      className={`fixed inset-0 bg-black/50 z-50 ${className}`}
      variants={overlayVariants}
      initial="hidden"
      animate="visible"
      exit="hidden"
      transition={{ duration: 0.2 }}
      onClick={() => onOpenChange(false)}
      data-state="open"
    />
  );
};

// Content component
const SheetContent: React.FC<SheetContentProps> = ({
  children,
  side = "right",
  className = "",
  onEscapeKeyDown,
  onPointerDownOutside,
}) => {
  const { open, onOpenChange } = useSheet();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onEscapeKeyDown?.(event);
        if (!event.defaultPrevented) {
          onOpenChange(false);
        }
      }
    };

    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange, onEscapeKeyDown]);

  const handlePointerDown = (event: React.PointerEvent) => {
    if (event.target === event.currentTarget) {
      const pointerEvent = event.nativeEvent;
      onPointerDownOutside?.(pointerEvent);
      if (!pointerEvent.defaultPrevented) {
        onOpenChange(false);
      }
    }
  };

  const getContentStyles = () => {
    const baseStyles = "fixed bg-white z-50 shadow-lg";

    switch (side) {
      case "top":
        return `${baseStyles} top-0 left-0 right-0 h-auto max-h-[80vh]`;
      case "right":
        return `${baseStyles} top-0 right-0 h-full w-full max-w-md`;
      case "bottom":
        return `${baseStyles} bottom-0 left-0 right-0 h-auto max-h-[80vh]`;
      case "left":
        return `${baseStyles} top-0 left-0 h-full w-full max-w-md`;
      default:
        return `${baseStyles} top-0 right-0 h-full w-full max-w-md`;
    }
  };

  return (
    <SheetPortal>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50" onPointerDown={handlePointerDown}>
            <SheetOverlay />
            <motion.div
              className={`${getContentStyles()} ${className}`}
              variants={contentVariants[side]}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={{
                type: "spring",
                damping: 25,
                stiffness: 300,
                duration: 0.3,
              }}
              data-state="open"
              role="dialog"
              aria-modal="true"
            >
              {children}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </SheetPortal>
  );
};

// Header component
const SheetHeader: React.FC<SheetHeaderProps> = ({
  children,
  className = "",
}) => {
  return (
    <div
      className={`flex flex-col space-y-2 text-center sm:text-left ${className}`}
    >
      {children}
    </div>
  );
};

// Title component
const SheetTitle: React.FC<SheetTitleProps> = ({
  children,
  className = "",
}) => {
  return (
    <h2 className={`text-lg font-semibold text-gray-900 ${className}`}>
      {children}
    </h2>
  );
};

// Description component
const SheetDescription: React.FC<SheetDescriptionProps> = ({
  children,
  className = "",
}) => {
  return <p className={`text-sm text-gray-500 ${className}`}>{children}</p>;
};

// Close component
const SheetClose: React.FC<SheetCloseProps> = ({
  children,
  className = "",
  asChild = false,
}) => {
  const { onOpenChange } = useSheet();

  const handleClick = () => {
    onOpenChange(false);
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      onClick: handleClick,
      className: `${
        (children.props as any).className || ""
      } ${className}`.trim(),
    });
  }

  return (
    <button onClick={handleClick} className={className} type="button">
      {children}
    </button>
  );
};

// Export all components
export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
