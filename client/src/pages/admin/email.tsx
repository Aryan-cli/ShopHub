import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Mail, CheckCircle, XCircle, RefreshCw, Clock, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface EmailStatus {
  configured: boolean;
  email: string | null;
}

interface EmailLog {
  id: string;
  recipientEmail: string;
  recipientUserId: string | null;
  emailType: string;
  subject: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

interface EmailLogsResponse {
  logs: EmailLog[];
  count: number;
  minutes: number;
}

export default function AdminEmailSettings() {
  const { data: status, isLoading: statusLoading } = useQuery<EmailStatus>({
    queryKey: ["/api/admin/email/status"],
  });

  const { data: logsData, isLoading: logsLoading, refetch } = useQuery<EmailLogsResponse>({
    queryKey: ["/api/admin/email/logs", 20],
    refetchInterval: 30000,
  });

  const getEmailTypeLabel = (type: string) => {
    switch (type) {
      case "chat":
        return "Chat Notification";
      case "purchase":
        return "Purchase Confirmation";
      case "sale":
        return "Sale Notification";
      default:
        return type;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-email-settings-title">
          Email Settings
        </h1>
        <p className="text-muted-foreground">
          Configure and monitor email notifications
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Configuration
          </CardTitle>
          <CardDescription>
            Server email account for sending notifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statusLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {status?.configured ? (
                  <>
                    <CheckCircle className="h-6 w-6 text-green-500" />
                    <div>
                      <p className="font-medium text-green-700 dark:text-green-400">Email Configured</p>
                      <p className="text-sm text-muted-foreground">
                        Sending from: <span className="font-mono">{status.email}</span>
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle className="h-6 w-6 text-red-500" />
                    <div>
                      <p className="font-medium text-red-700 dark:text-red-400">Email Not Configured</p>
                      <p className="text-sm text-muted-foreground">
                        Set GMAIL_USER and GMAIL_APP_PASSWORD environment variables
                      </p>
                    </div>
                  </>
                )}
              </div>

              {!status?.configured && (
                <div className="bg-muted/50 p-4 rounded-md space-y-2">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    How to Configure Gmail
                  </p>
                  <ol className="text-sm text-muted-foreground list-decimal ml-4 space-y-1">
                    <li>Go to Google Account settings</li>
                    <li>Enable 2-Step Verification</li>
                    <li>Create an App Password for Mail</li>
                    <li>Set GMAIL_USER = your Gmail address</li>
                    <li>Set GMAIL_APP_PASSWORD = the 16-character app password</li>
                  </ol>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Email Logs
            </CardTitle>
            <CardDescription>
              Emails sent in the last 20 minutes
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-logs">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : logsData?.logs && logsData.logs.length > 0 ? (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground mb-4">
                {logsData.count} email{logsData.count !== 1 ? 's' : ''} sent in the last {logsData.minutes} minutes
              </div>
              {logsData.logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between gap-4 p-3 bg-muted/30 rounded-md"
                  data-testid={`email-log-${log.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={log.status === "sent" ? "default" : "destructive"} className="text-xs">
                        {log.status === "sent" ? "Sent" : "Failed"}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {getEmailTypeLabel(log.emailType)}
                      </Badge>
                    </div>
                    <p className="font-medium mt-1 truncate">{log.subject}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      To: {log.recipientEmail}
                    </p>
                    {log.errorMessage && (
                      <p className="text-sm text-red-500 mt-1">{log.errorMessage}</p>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No emails sent in the last 20 minutes</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
