import React from "react";
import { MessageSquare } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-16">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4" style={{ backgroundColor: 'hsl(var(--muted))' }}>
        <MessageSquare className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2 text-foreground">No messages yet</h3>
      <p className="text-sm text-muted-foreground">Start a conversation with your agent</p>
    </div>
  );
}
