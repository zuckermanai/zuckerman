import React from "react";
import { MessageSquare } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-16">
      <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
        <MessageSquare className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold mb-1 text-foreground">No messages yet</h3>
      <p className="text-sm text-muted-foreground">Start a conversation with your agent</p>
    </div>
  );
}
