let connection;
let dotNetReference;

export async function start(reference, hubUrl) {
    if (connection) {
        return;
    }

    dotNetReference = reference;
    connection = new globalThis.signalR.HubConnectionBuilder()
        .withUrl(hubUrl)
        .withAutomaticReconnect([0, 2000, 5000, 10000])
        .build();

    connection.on('activityReceived', activity => {
        if (dotNetReference) {
            void dotNetReference.invokeMethodAsync('ReceiveActivity', activity).catch(() => undefined);
        }
    });
    connection.onreconnected(() => {
        if (dotNetReference) {
            void dotNetReference.invokeMethodAsync('Reconnected').catch(() => undefined);
        }
    });
    await connection.start();
}

export async function stop() {
    if (!connection) {
        return;
    }

    const current = connection;
    connection = undefined;
    dotNetReference = undefined;
    await current.stop();
}
