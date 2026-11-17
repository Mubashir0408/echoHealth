# Third-party sources

- **Google YAMNet / TensorFlow models:** copyright The TensorFlow Authors, Apache License 2.0. Source: https://github.com/tensorflow/models/tree/master/research/audioset/yamnet. License: https://github.com/tensorflow/models/blob/master/LICENSE. This implementation uses published contracts and model artifacts; it does not vendor upstream Python source.
- **Hugging Face mirror:** https://huggingface.co/thelou1s/yamnet, revision `156527d`. Card declares `apache-2.0`; mirror of Google YAMNet releases. The repository does not provide a separate license file in the inspected root listing. Preserve upstream notices when distributing the downloaded model and verify distribution obligations.
- **TensorFlow runtime:** Apache-2.0, https://github.com/tensorflow/tensorflow/blob/master/LICENSE.
- **NumPy:** BSD-3-Clause, https://github.com/numpy/numpy/blob/main/LICENSE.txt.
- **SciPy:** BSD-3-Clause, https://github.com/scipy/scipy/blob/main/LICENSE.txt.
- **SoundFile:** BSD-3-Clause, https://github.com/bastibe/python-soundfile/blob/master/LICENSE. Its bundled libsndfile and transitive libraries have separate notices, including LGPL; consult the installed wheel.
- **Example recording:** public URL linked by Google's YAMNet tutorial: https://storage.googleapis.com/audioset/speech_whistling2.wav. Audio is not bundled. No audio redistribution license is asserted.

This inventory is not a substitute for the license and notice files in the installed distributions. Original EchoHealth code has no project-wide license assigned yet.
