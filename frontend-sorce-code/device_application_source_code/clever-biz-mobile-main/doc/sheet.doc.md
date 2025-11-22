# Sheet Component Documentation

A customizable sheet component built with Framer Motion animations, inspired by Radix UI's dialog patterns. The sheet provides a sliding panel overlay that can appear from any side of the screen with smooth animations.

## Features

- **Smooth Animations**: Built with Framer Motion for natural spring animations
- **Multiple Positions**: Supports top, right, bottom, and left positioning
- **Accessibility**: Full keyboard navigation and ARIA compliance
- **Type Safety**: Comprehensive TypeScript interfaces
- **Controlled/Uncontrolled**: Flexible state management
- **Portal Rendering**: Renders outside DOM tree to avoid z-index issues
- **Customizable**: Easy styling with className props

## Installation

Ensure you have the required dependencies:

```bash
npm install framer-motion react react-dom
```

## Basic Usage

```tsx
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose
} from './components/ui/sheet';

function App() {
  return (
    <Sheet>
      <SheetTrigger className="px-4 py-2 bg-blue-500 text-white rounded">
        Open Sheet
      </SheetTrigger>
      
      <SheetContent side="right" className="p-6">
        <SheetHeader>
          <SheetTitle>Sheet Title</SheetTitle>
          <SheetDescription>
            This is a description of the sheet content.
          </SheetDescription>
        </SheetHeader>
        
        <div className="mt-4">
          <p>Your content goes here...</p>
        </div>
        
        <SheetClose className="mt-4 px-4 py-2 bg-gray-200 rounded">
          Close
        </SheetClose>
      </SheetContent>
    </Sheet>
  );
}
```

## API Reference

### Sheet (Root)

The root component that manages the sheet's state and provides context to child components.

**Props:**
- `children: React.ReactNode` - Child components
- `open?: boolean` - Controlled open state
- `onOpenChange?: (open: boolean) => void` - Callback when open state changes
- `defaultOpen?: boolean` - Default open state for uncontrolled usage

**Example:**
```tsx
// Uncontrolled
<Sheet defaultOpen={false}>
  {/* ... */}
</Sheet>

// Controlled
const [open, setOpen] = useState(false);
<Sheet open={open} onOpenChange={setOpen}>
  {/* ... */}
</Sheet>
```

### SheetTrigger

The button that opens the sheet.

**Props:**
- `children: React.ReactNode` - Button content or child element
- `asChild?: boolean` - Render as child element instead of button
- `className?: string` - Additional CSS classes
- `onClick?: () => void` - Additional click handler

**Example:**
```tsx
<SheetTrigger className="btn-primary">
  Open Sheet
</SheetTrigger>

// Using asChild to render as custom element
<SheetTrigger asChild>
  <button className="custom-button">Custom Button</button>
</SheetTrigger>
```

### SheetContent

The main content container that slides in from the specified side.

**Props:**
- `children: React.ReactNode` - Sheet content
- `side?: "top" | "right" | "bottom" | "left"` - Side to slide from (default: "right")
- `className?: string` - Additional CSS classes
- `onEscapeKeyDown?: (event: KeyboardEvent) => void` - Escape key handler
- `onPointerDownOutside?: (event: PointerEvent) => void` - Outside click handler

**Example:**
```tsx
<SheetContent 
  side="left" 
  className="w-80 p-6"
  onEscapeKeyDown={(e) => console.log('Escape pressed')}
>
  {/* Content */}
</SheetContent>
```

### SheetHeader

A container for the sheet's title and description with proper spacing.

**Props:**
- `children: React.ReactNode` - Header content
- `className?: string` - Additional CSS classes

### SheetTitle

An accessible title for the sheet.

**Props:**
- `children: React.ReactNode` - Title text
- `className?: string` - Additional CSS classes

### SheetDescription

An optional description for the sheet content.

**Props:**
- `children: React.ReactNode` - Description text
- `className?: string` - Additional CSS classes

### SheetClose

A button that closes the sheet.

**Props:**
- `children: React.ReactNode` - Button content or child element
- `className?: string` - Additional CSS classes
- `asChild?: boolean` - Render as child element instead of button

**Example:**
```tsx
<SheetClose className="btn-secondary">
  Close
</SheetClose>

// Using asChild
<SheetClose asChild>
  <button className="custom-close-btn">×</button>
</SheetClose>
```

## Advanced Examples

### Controlled Sheet with Form

```tsx
function FormSheet() {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '' });

  const handleSubmit = (e) => {
    e.preventDefault();
    // Process form data
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger>Add User</SheetTrigger>
      <SheetContent side="right" className="w-96 p-6">
        <SheetHeader>
          <SheetTitle>Add New User</SheetTitle>
          <SheetDescription>
            Fill in the details to create a new user account.
          </SheetDescription>
        </SheetHeader>
        
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <input
            type="text"
            placeholder="Name"
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            className="w-full p-2 border rounded"
          />
          <input
            type="email"
            placeholder="Email"
            value={formData.email}
            onChange={(e) => setFormData({...formData, email: e.target.value})}
            className="w-full p-2 border rounded"
          />
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded">
              Save
            </button>
            <SheetClose className="px-4 py-2 bg-gray-200 rounded">
              Cancel
            </SheetClose>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
```

### Navigation Sheet

```tsx
function NavigationSheet() {
  return (
    <Sheet>
      <SheetTrigger className="md:hidden">
        ☰ Menu
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <div className="p-6">
          <SheetTitle>Navigation</SheetTitle>
        </div>
        <nav className="space-y-2">
          <a href="/" className="block px-6 py-3 hover:bg-gray-100">Home</a>
          <a href="/about" className="block px-6 py-3 hover:bg-gray-100">About</a>
          <a href="/contact" className="block px-6 py-3 hover:bg-gray-100">Contact</a>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
```

### Bottom Sheet (Mobile-style)

```tsx
function MobileBottomSheet() {
  return (
    <Sheet>
      <SheetTrigger>Show Options</SheetTrigger>
      <SheetContent side="bottom" className="h-auto max-h-[50vh] p-6">
        <SheetHeader>
          <SheetTitle>Quick Actions</SheetTitle>
        </SheetHeader>
        <div className="grid grid-cols-3 gap-4 mt-6"></div> <button className="p-4 text-center border rounded">Share</button>
          <button className="p-4 text-center border rounded">Edit</button>
          <button className="p-4 text-center border rounded">Delete</button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

## Styling

The component uses Tailwind CSS classes by default but can be customized:

```tsx
<SheetContent 
  side="right" 
  className="bg-gray-900 text-white border-l border-gray-700"
>
  {/* Dark theme content */}
</SheetContent>
```

## Accessibility

The sheet component follows accessibility best practices:

- **Keyboard Navigation**: Supports Escape key to close
- **Focus Management**: Traps focus within the sheet when open
- **ARIA Attributes**: Proper `role="dialog"` and `aria-modal="true"`
- **Screen Reader Support**: Accessible titles and descriptions

## Animation Customization

The animations use Framer Motion and can be customized by modifying the variants:

```tsx
// Custom animation variants
const customContentVariants = {
  right: {
    hidden: { x: "100%", opacity: 0 },
    visible: { x: 0, opacity: 1 }
  }
};
```

## Browser Support

- Modern browsers with ES6+ support
- React 16.8+ (hooks support)
- Framer Motion compatibility

## Performance Notes

- Uses React Portal for optimal rendering
- Animations are GPU-accelerated via Framer Motion
- Body scroll is locked when sheet is open
- Event listeners are properly cleaned up