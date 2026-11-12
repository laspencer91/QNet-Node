// Fixture: the demo's network setup, plus a decoy list the generator must not pick by default.
network = new QNetwork({
	messages:    [PlayerState, CounterMessage, ChatMessage, TestVec, TestBlob, TestManual],
	max_clients: 7,
});
other_list = new QSerializer([CounterMessage]);
