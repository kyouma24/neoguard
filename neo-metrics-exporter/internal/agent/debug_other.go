//go:build !linux

package agent

func (a *Agent) startDebugSignalHandler() {}
