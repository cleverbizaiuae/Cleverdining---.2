import React from "react";

export const Footer: React.FC = () => {
    return (
        <div className="flex flex-col items-center gap-4 pt-4 pb-2 w-full shrink-0">
            <a
                href="https://instagram.com/cleverbiz.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/60 hover:text-primary transition-colors"
            >
                Powered by Cleverbiz AI
            </a>
        </div>
    );
};
