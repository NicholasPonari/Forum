"use client";

import { useState, useEffect } from "react";
import { Shield, ShieldAlert, ShieldCheck, Loader2, ExternalLink } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VerificationResult {
  verified: boolean;
  tampered: boolean;
  onChain: boolean;
  isDeleted: boolean;
  txHash?: string;
  blockNumber?: number;
  timestamp?: string;
  dbHash?: string;
  recordedHash?: string;
  onChainHash?: string;
  status?: string;
  message?: string;
}

interface BlockchainVerificationBadgeProps {
  contentId: string;
  contentType: "issue" | "comment" | "vote";
  className?: string;
  showLabel?: boolean;
  autoVerify?: boolean;
}

export function BlockchainVerificationBadge({
  contentId,
  contentType,
  className,
  showLabel = false,
  autoVerify = false,
}: BlockchainVerificationBadgeProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [open, setOpen] = useState(false);

  const verifyContent = async (showDialog = false) => {
    setLoading(true);
    if (showDialog) setOpen(true);
    try {
      const res = await fetch(
        `/api/blockchain/verify-content?contentId=${contentId}&contentType=${contentType}`
      );
      const data = await res.json();
      setResult(data);
    } catch (error) {
      console.error("Verification failed:", error);
      setResult({
        verified: false,
        tampered: false,
        onChain: false,
        isDeleted: false,
        message: "Failed to connect to verification service.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoVerify) {
      verifyContent(false);
    }
  }, [autoVerify, contentId, contentType]);

  // Determine icon and color based on state
  let Icon = Shield;
  let iconClass = "text-muted-foreground/50 hover:text-primary";
  
  if (result) {
      if (result.tampered) {
          Icon = ShieldAlert;
          iconClass = "text-red-600 animate-pulse";
      } else if (result.verified) {
          Icon = ShieldCheck;
          iconClass = "text-green-600";
      } else {
          Icon = Shield; // Not anchored or other status
          iconClass = "text-amber-500";
      }
  }

  // Small icon to trigger verification
  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-6 w-6 p-0 hover:bg-transparent", className)}
              onClick={(e) => {
                e.stopPropagation();
                // If we already have a result, just open the dialog
                if (result) {
                    setOpen(true);
                } else {
                    verifyContent(true);
                }
              }}
            >
              <Icon className={cn("h-4 w-4 transition-colors", iconClass)} />
              {showLabel && <span className="ml-1 text-xs text-muted-foreground">Verify</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{result?.tampered ? "Tamper Detected!" : result?.verified ? "Verified on Blockchain" : "Verify on Blockchain"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Content Verification
            </DialogTitle>
            <DialogDescription>
              Verifying integrity against the immutable ledger.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Checking blockchain records...</p>
              </div>
            ) : result ? (
              <div className="space-y-4">
                <div
                  className={cn(
                    "p-4 rounded-lg border flex items-start gap-3",
                    result.verified
                      ? "bg-green-50/50 border-green-200"
                      : result.tampered
                      ? "bg-red-50/50 border-red-200"
                      : "bg-amber-50/50 border-amber-200"
                  )}
                >
                  {result.verified ? (
                    <ShieldCheck className="h-5 w-5 text-green-600 mt-0.5" />
                  ) : result.tampered ? (
                    <ShieldAlert className="h-5 w-5 text-red-600 mt-0.5" />
                  ) : (
                    <Shield className="h-5 w-5 text-amber-600 mt-0.5" />
                  )}
                  
                  <div className="space-y-1">
                    <h4 className={cn("font-medium text-sm", 
                        result.verified ? "text-green-900" : 
                        result.tampered ? "text-red-900" : "text-amber-900"
                    )}>
                      {result.verified
                        ? "Verified Authentic"
                        : result.tampered
                        ? "Tamper Detected!"
                        : "Not Anchored"}
                    </h4>
                    <p className={cn("text-xs",
                        result.verified ? "text-green-800" : 
                        result.tampered ? "text-red-800" : "text-amber-800"
                    )}>
                      {result.verified
                        ? "This content exactly matches the immutable record on the blockchain."
                        : result.tampered
                        ? "The content in the database does NOT match the blockchain record. It may have been modified by an administrator."
                        : result.message || "This content has not been recorded on the blockchain yet."}
                    </p>
                  </div>
                </div>

                {result.onChain && (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-[100px_1fr] gap-1">
                      <span className="text-muted-foreground font-medium">Status:</span>
                      <span className={cn(
                          result.isDeleted ? "text-red-500 font-medium" : "text-green-600 font-medium"
                      )}>
                        {result.isDeleted ? "Deleted (Tombstone)" : "Active"}
                      </span>

                      <span className="text-muted-foreground font-medium">Timestamp:</span>
                      <span className="font-mono">
                        {result.timestamp ? new Date(result.timestamp).toLocaleString() : "N/A"}
                      </span>

                      <span className="text-muted-foreground font-medium">Block:</span>
                      <span className="font-mono">#{result.blockNumber}</span>

                      <span className="text-muted-foreground font-medium">Tx Hash:</span>
                      <span className="font-mono truncate" title={result.txHash}>
                        {result.txHash}
                      </span>
                      
                      {/* Debug hashes for nerds */}
                      {result.tampered && (
                          <>
                            <span className="text-muted-foreground font-medium text-red-500">DB Hash:</span>
                            <span className="font-mono truncate text-[10px] text-red-500" title={result.dbHash}>
                                {result.dbHash}
                            </span>
                            <span className="text-muted-foreground font-medium text-green-600">Chain Hash:</span>
                            <span className="font-mono truncate text-[10px] text-green-600" title={result.recordedHash}>
                                {result.recordedHash}
                            </span>
                          </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
