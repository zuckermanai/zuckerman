import React from "react";
import { AlertCircle, Terminal, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface GatewayConnectionErrorProps {
  onRetry?: () => void;
}

export function ConnectionError({ onRetry }: GatewayConnectionErrorProps) {
  return (
    <div className="flex items-center justify-center h-full p-6">
      <Card className="max-w-2xl w-full">
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <div>
              <CardTitle>Gateway Not Connected</CardTitle>
              <CardDescription>
                Unable to connect to the Zuckerman gateway server
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              The gateway server needs to be running before you can use the app. 
              Start it using one of the following methods:
            </p>
          </div>

          <div className="space-y-3">
            <div className="p-4 bg-muted rounded-lg border">
              <div className="flex items-start gap-3">
                <Terminal className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="font-medium text-sm">Method 1: CLI Command</div>
                  <div className="text-sm text-muted-foreground font-mono bg-background p-2 rounded">
                    pnpm gateway
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Or from the project root: <code className="bg-background px-1 py-0.5 rounded">pnpm gateway</code>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-muted rounded-lg border">
              <div className="flex items-start gap-3">
                <Terminal className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="font-medium text-sm">Method 2: Direct Command</div>
                  <div className="text-sm text-muted-foreground font-mono bg-background p-2 rounded">
                    zuckerman gateway
                  </div>
                  <div className="text-xs text-muted-foreground">
                    If installed globally, use: <code className="bg-background px-1 py-0.5 rounded">zuckerman gateway</code>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2 flex items-center gap-2">
            {onRetry && (
              <Button onClick={onRetry} variant="default">
                Retry Connection
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                // Open terminal/docs in external browser
                window.open("https://github.com/zuckerman/zuckerman", "_blank");
              }}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View Documentation
            </Button>
          </div>

          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              The gateway server runs on <code className="bg-background px-1 py-0.5 rounded">ws://127.0.0.1:18789</code> by default.
              Make sure no firewall is blocking this connection.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
