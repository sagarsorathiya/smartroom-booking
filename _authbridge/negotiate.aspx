<%@ Page Language="C#" %>
<%@ Import Namespace="System.Net" %>
<%@ Import Namespace="System.IO" %>
<script runat="server">
// Bridges IIS Windows Authentication to the Node backend.
// Runs natively in the IIS/ASP.NET pipeline (not proxied via ARR) so
// User.Identity.Name is reliably populated after auth succeeds — ARR's
// reverse-proxy rewrite rules do not reliably expose {LOGON_USER}.
void Page_Load(object sender, EventArgs e)
{
    Response.Clear();
    Response.ContentType = "application/json";

    string identity = (User != null && User.Identity != null) ? User.Identity.Name : null;
    if (string.IsNullOrEmpty(identity))
    {
        Response.StatusCode = 401;
        Response.Write("{\"error\":\"No domain credentials detected\"}");
        Response.End();
        return;
    }

    string domainId = identity;
    int slashIdx = domainId.IndexOf('\\');
    if (slashIdx >= 0)
    {
        domainId = domainId.Substring(slashIdx + 1);
    }
    else
    {
        int atIdx = domainId.IndexOf('@');
        if (atIdx >= 0) domainId = domainId.Substring(0, atIdx);
    }

    try
    {
        HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:3002/api/auth/negotiate");
        req.Method = "GET";
        req.Headers["X-Remote-User"] = domainId;
        req.Timeout = 10000;

        HttpWebResponse resp;
        try
        {
            resp = (HttpWebResponse)req.GetResponse();
        }
        catch (WebException wex)
        {
            resp = wex.Response as HttpWebResponse;
            if (resp == null)
            {
                Response.StatusCode = 502;
                Response.Write("{\"error\":\"Upstream request failed\"}");
                Response.End();
                return;
            }
        }

        using (resp)
        {
            Response.StatusCode = (int)resp.StatusCode;
            using (Stream s = resp.GetResponseStream())
            using (StreamReader sr = new StreamReader(s))
            {
                Response.Write(sr.ReadToEnd());
            }
        }
    }
    catch (Exception ex)
    {
        Response.StatusCode = 500;
        Response.Write("{\"error\":\"Bridge error: " + ex.Message.Replace("\"", "'") + "\"}");
    }
    Response.End();
}
</script>
