import { RecordId } from "surrealdb";

const extractId = (surrealId) => toId(surrealId.split(":")[1]) ?? surrealId;
/** @internal */
// Convert DB object to AdapterUser
export const docToUser = (doc) => ({
    ...doc,
    id: doc.id.id.toString(),
    emailVerified: doc.emailVerified ? new Date(doc.emailVerified) : null,
});
/** @internal */
// Convert DB object to AdapterAccount
export const docToAccount = (doc) => {
    const account = {
        ...doc,
        id: doc.id.id.toString(),
        userId: doc.userId.id.toString(),
    };
    return account;
};
/** @internal */
// Convert DB object to AdapterSession
export const docToSession = (doc) => {
    if (!doc) return null;
    return {
        id: doc.id.id.toString(),
        userId: doc.userId.id.toString(),
        expires: new Date(doc.expires ?? ""),
        sessionToken: doc.sessionToken ?? "",
    };
};
/** @internal */
// Convert AdapterUser to DB object
const userToDoc = (user) => ({
    ...user,
    emailVerified: user.emailVerified?.toISOString(),
});
/** @internal */
// Convert AdapterAccount to DB object
const accountToDoc = (account) => ({
    ...account,
    userId: new RecordId("user", account.userId),
});
/** @internal */
// Convert AdapterSession to DB object
export const sessionToDoc = (session) => {
    if (!session) return null;
    return {
        ...session,
        id: session.id ? new RecordId("session", session.id) : undefined,
        userId: new RecordId("user", session.userId),
        expires: session.expires.toISOString(),
    };
};
export const toSurrealId = (id) => {
    if (/^⟨.+⟩$/.test(id)) {
        return id;
    }
    else {
        return `⟨${id}⟩`;
    }
};
export const toId = (surrealId) => {
    return surrealId.replace(/^⟨(.+)⟩$/, "$1");
};
export function SurrealDBAdapter(client
// options = {}
) {
    return {
        async createUser(user) {
            const surreal = await client;
            const doc = userToDoc(user);
            const [userDoc] = await surreal.create("user", doc);
            if (userDoc) {
                return docToUser(userDoc);
            }
            throw new Error("User not created");
        },
        async getUser(id) {
            const surreal = await client;
            try {
                const rid = new RecordId("user", id);
                const queryResult = await surreal.query("SELECT * FROM $user", {
                    user: rid,
                });
                const doc = queryResult[0]?.[0];
                if (doc) {
                    return docToUser(doc);
                }
            }
            catch { }
            return null;
        },
        async getUserByEmail(email) {
            const surreal = await client;
            try {
                const users = await surreal.query(`SELECT * FROM user WHERE email = $email`, { email });
                const doc = users[0]?.[0];
                if (doc)
                    return docToUser(doc);
            }
            catch { }
            return null;
        },
        async getUserByAccount({ providerAccountId, provider }) {
            const surreal = await client;
            try {
                const users = await surreal.query(`SELECT userId
           FROM account
           WHERE providerAccountId = $providerAccountId
           AND provider = $provider
           FETCH userId`, { providerAccountId, provider });
                const user = users[0]?.[0]?.userId;
                if (user)
                    return docToUser(user);
            }
            catch { }
            return null;
        },
        async updateUser(user) {
            if (!user.id)
                throw new Error("User id is required");
            const surreal = await client;
            const doc = {
                ...user,
                emailVerified: user.emailVerified?.toISOString(),
                id: undefined,
            };
            const rid = new RecordId("user", user.id);
            const updatedUser = await surreal.merge(rid, doc);
            if (updatedUser.length) {
                return docToUser(updatedUser[0]);
            }
            else {
                throw new Error("User not updated");
            }
        },
        async deleteUser(userId) {
            const surreal = await client;
            const rid = new RecordId("user", userId);
            // delete account
            try {
                const accounts = await surreal.query(`SELECT *
          FROM account
          WHERE userId = $userId
          LIMIT 1`, { userId: rid });
                const account = accounts[0]?.[0];
                if (account) {
                    await surreal.delete(account.id);
                }
            }
            catch { }
            // delete session
            try {
                const sessions = await surreal.query(`SELECT *
          FROM session
          WHERE userId = $userId
          LIMIT 1`, { userId: rid });
                const session = sessions[0]?.[0];
                if (session) {
                    await surreal.delete(session.id);
                }
            }
            catch { }
            // delete user
            await surreal.delete(rid);
        },
        async linkAccount(account) {
            const surreal = await client;
            const doc = accountToDoc(account);
            const [linkedAccount] = await surreal.create("account", doc);
            if (linkedAccount) {
                return docToAccount(linkedAccount);
            }
            throw new Error("Account not linked");
        },
        async unlinkAccount({ providerAccountId, provider }) {
            const surreal = await client;
            try {
                const accounts = await surreal.query(`SELECT *
          FROM account
          WHERE providerAccountId = $providerAccountId
            AND provider = $provider
          LIMIT 1`, { providerAccountId, provider });
                const account = accounts[0]?.[0];
                if (account) {
                    await surreal.delete(account.id);
                }
            }
            catch { }
        },
        async createSession({ sessionToken, userId, expires }) {
            const surreal = await client;
            const doc = sessionToDoc({
                sessionToken,
                userId,
                expires,
            });
            const [session] = await surreal.create("session", doc);
            if (!session) {
                throw new Error("Session not created");
            }
            return docToSession(session);
        },
        async getSessionAndUser(sessionToken) {
            const surreal = await client;
            try {
                const sessions = await surreal.query(
                    `SELECT *, userId FROM session 
                     WHERE sessionToken = $sessionToken 
                     FETCH userId`,
                    { sessionToken }
                );
                
                const sessionData = sessions[0]?.[0];
                if (sessionData?.userId) {
                    return {
                        user: docToUser(sessionData.userId),
                        session: docToSession(sessionData),
                    };
                }
            } catch (error) {
                console.error("[auth][error] Error in getSessionAndUser:", error);
            }
            return null;
        },
        async updateSession(session) {
            const surreal = await client;
            try {
                const sessions = await surreal.query(`SELECT *
          FROM session
          WHERE sessionToken = $sessionToken
          LIMIT 1`, { sessionToken: session.sessionToken });
                const sessionDoc = sessions[0]?.[0];
                if (sessionDoc && session.expires) {
                    const updatedSession = await surreal.merge(sessionDoc.id, sessionToDoc({
                        ...sessionDoc,
                        ...session,
                        userId: sessionDoc.userId.id.toString(),
                        expires: session.expires,
                    }));
                    if (updatedSession.length) {
                        return docToSession(updatedSession[0]);
                    }
                    else {
                        return null;
                    }
                }
            }
            catch { }
            return null;
        },
        async deleteSession(sessionToken) {
            const surreal = await client;
            try {
                const sessions = await surreal.query(`SELECT *
           FROM session
           WHERE sessionToken = $sessionToken
           LIMIT 1`, { sessionToken });
                const session = sessions[0]?.[0];
                if (session) {
                    await surreal.delete(session.id);
                    return;
                }
            }
            catch { }
        },
        async createVerificationToken(params) {
            const surreal = await client;
            const doc = {
                identifier: params.identifier,
                expires: params.expires.toISOString(),
                token: params.token,
            };
            const [token] = await surreal.create("verification_token", doc);
            if (token) {
                return {
                    identifier: token.identifier,
                    expires: new Date(token.expires),
                    token: token.token,
                };
            }
            return null;
        },
        async useVerificationToken({ identifier, token }) {
            const surreal = await client;
            try {
                const tokens = await surreal.query(`SELECT *
           FROM verification_token
           WHERE identifier = $identifier
             AND token = $verificationToken
           LIMIT 1`, { identifier, verificationToken: token });
                if (tokens.length && tokens[0]) {
                    const vt = tokens[0][0];
                    if (vt) {
                        await surreal.delete(vt.id);
                        return {
                            identifier: vt.identifier,
                            expires: new Date(vt.expires),
                            token: vt.token,
                        };
                    }
                }
                else {
                    return null;
                }
            }
            catch { }
            return null;
        },
    };
}
