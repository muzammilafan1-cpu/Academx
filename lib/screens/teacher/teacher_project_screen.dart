import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class TeacherProjectScreen extends StatefulWidget {
  const TeacherProjectScreen({super.key});

  @override
  State<TeacherProjectScreen> createState() =>
      _TeacherProjectScreenState();
}

class _TeacherProjectScreenState extends State<TeacherProjectScreen> {
  final titleController = TextEditingController();
  final descriptionController = TextEditingController();

  String selectedClass = "10";
  String selectedSection = "A";

  String assignType = "class"; // class or group

  List<Map<String, dynamic>> students = [];
  List<String> selectedStudentIds = [];

  bool loading = false;
  bool showStudents = false;

  String? institutionId;
  String? teacherId;

  String? editingProjectId;

  @override
  void initState() {
    super.initState();
    fetchUserData();
  }

  Future<void> fetchUserData() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    teacherId = user.uid;

    final userDoc = await FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .get();

    institutionId = userDoc.data()?['institutionId'];

    await fetchStudents();

    setState(() {});
  }

  Future<void> fetchStudents() async {
    final snapshot = await FirebaseFirestore.instance
        .collection('institutions')
        .doc(institutionId)
        .collection('users')
        .where('role', isEqualTo: 'student')
        .get();

    students = snapshot.docs.map((doc) {
      return {
        "id": doc.id,
        "name": doc['name'] ?? "No Name",
      };
    }).toList();
  }

  Future<void> saveProject() async {
    if (titleController.text.isEmpty ||
        descriptionController.text.isEmpty ||
        institutionId == null ||
        teacherId == null) return;

    setState(() => loading = true);

    final data = {
      "title": titleController.text.trim(),
      "description": descriptionController.text.trim(),
      "class": selectedClass,
      "section": selectedSection,
      "type": assignType,
      "studentIds":
      assignType == "group" ? selectedStudentIds : [],
      "dueDate": DateTime.now().toString().split(" ")[0],
      "institutionId": institutionId,
      "createdBy": teacherId,
      "timestamp": FieldValue.serverTimestamp(),
    };

    if (editingProjectId == null) {
      await FirebaseFirestore.instance
          .collection('projects')
          .add(data);

      await FirebaseFirestore.instance.collection('alerts').add({
        'institutionId': institutionId,
        'title': "New Project Assigned",
        'message': "Project added for Class $selectedClass-$selectedSection",
        'source': "projects",
        'referenceId': "", // optional for now
        'targetRoles': ["student"],
        'createdAt': FieldValue.serverTimestamp(),
        'read': false,
      });

    } else {
      await FirebaseFirestore.instance
          .collection('projects')
          .doc(editingProjectId)
          .update(data);
    }

    clearForm();
  }

  void clearForm() {
    titleController.clear();
    descriptionController.clear();
    selectedStudentIds.clear();
    assignType = "class";
    editingProjectId = null;
    setState(() => loading = false);
  }

  void loadForEdit(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    titleController.text = data['title'];
    descriptionController.text = data['description'];
    selectedClass = data['class'];
    selectedSection = data['section'];
    assignType = data['type'];
    selectedStudentIds =
    List<String>.from(data['studentIds'] ?? []);

    editingProjectId = doc.id;

    setState(() {});

    Scrollable.ensureVisible(
      context,
      duration: const Duration(milliseconds: 300),
    );
  }

  Future<void> deleteProject(String id) async {
    await FirebaseFirestore.instance
        .collection('projects')
        .doc(id)
        .delete();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Projects")),
      body: institutionId == null
          ? const Center(child: CircularProgressIndicator())
          : Column(
        children: [

          /// 🔹 FORM
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [

                TextField(
                  controller: titleController,
                  decoration: const InputDecoration(
                    labelText: "Title",
                    border: OutlineInputBorder(),
                  ),
                ),

                const SizedBox(height: 12),

                TextField(
                  controller: descriptionController,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: "Description",
                    border: OutlineInputBorder(),
                  ),
                ),

                const SizedBox(height: 12),

                /// ASSIGN TYPE
                Row(
                  children: [
                    Expanded(
                      child: RadioListTile(
                        title: const Text("Entire Class"),
                        value: "class",
                        groupValue: assignType,
                        onChanged: (val) {
                          setState(() {
                            assignType = val!;
                          });
                        },
                      ),
                    ),
                    Expanded(
                      child: RadioListTile(
                        title: const Text("Selected"),
                        value: "group",
                        groupValue: assignType,
                        onChanged: (val) {
                          setState(() {
                            assignType = val!;
                          });
                        },
                      ),
                    ),
                  ],
                ),

                Row(
                  children: [

                    Expanded(
                      child: DropdownButtonFormField(
                        value: selectedClass,
                        items: ["10", "9", "8"]
                            .map((e) => DropdownMenuItem(
                          value: e,
                          child: Text("Class $e"),
                        ))
                            .toList(),
                        onChanged: (val) {
                          setState(() {
                            selectedClass = val.toString();
                          });
                        },
                        decoration: const InputDecoration(
                          labelText: "Class",
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),

                    const SizedBox(width: 10),

                    Expanded(
                      child: DropdownButtonFormField(
                        value: selectedSection,
                        items: ["A", "B", "C"]
                            .map((e) => DropdownMenuItem(
                          value: e,
                          child: Text("Section $e"),
                        ))
                            .toList(),
                        onChanged: (val) {
                          setState(() {
                            selectedSection = val.toString();
                          });
                        },
                        decoration: const InputDecoration(
                          labelText: "Section",
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                  ],
                ),

                /// STUDENT SELECT
                if (assignType == "group") ...[
                  const SizedBox(height: 10),

                  Align(
                    alignment: Alignment.centerLeft,
                    child: GestureDetector(
                      onTap: () {
                        setState(() {
                          showStudents = !showStudents;
                        });
                      },
                      child: const Text(
                        "Select Students ▼",
                        style: TextStyle(
                            fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),

                  if (showStudents)
                    SizedBox(
                      height: 150,
                      child: ListView.builder(
                        itemCount: students.length,
                        itemBuilder: (context, index) {
                          final student = students[index];
                          final id = student['id'];

                          return CheckboxListTile(
                            value:
                            selectedStudentIds.contains(id),
                            title: Text(student['name']),
                            onChanged: (val) {
                              setState(() {
                                if (val == true) {
                                  selectedStudentIds.add(id);
                                } else {
                                  selectedStudentIds.remove(id);
                                }
                              });
                            },
                          );
                        },
                      ),
                    ),
                ],

                const SizedBox(height: 16),

                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: loading ? null : saveProject,
                    child: Text(
                        editingProjectId == null
                            ? "Add Project"
                            : "Update Project"),
                  ),
                ),
              ],
            ),
          ),

          const Divider(),

          /// 🔥 LIST
          Expanded(
            child: StreamBuilder<QuerySnapshot>(
              stream: FirebaseFirestore.instance
                  .collection('projects')
                  .where('institutionId',
                  isEqualTo: institutionId)
                  .orderBy('timestamp', descending: true)
                  .snapshots(),
              builder: (context, snapshot) {

                if (!snapshot.hasData) {
                  return const Center(
                      child: CircularProgressIndicator());
                }

                final docs = snapshot.data!.docs;

                return ListView.builder(
                  itemCount: docs.length,
                  itemBuilder: (context, index) {
                    final doc = docs[index];
                    final data =
                    doc.data() as Map<String, dynamic>;

                    return Card(
                      margin: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 6),
                      child: ListTile(
                        title: Text(data['title']),
                        subtitle: Column(
                          crossAxisAlignment:
                          CrossAxisAlignment.start,
                          children: [
                            Text(data['description']),
                            Text(
                                "Class ${data['class']} - ${data['section']}"),
                          ],
                        ),

                        /// 🔥 MENU
                        trailing: PopupMenuButton(
                          itemBuilder: (context) => [
                            const PopupMenuItem(
                                value: "edit",
                                child: Text("Edit")),
                            const PopupMenuItem(
                                value: "delete",
                                child: Text("Delete")),
                          ],
                          onSelected: (value) {
                            if (value == "edit") {
                              loadForEdit(doc);
                            } else if (value == "delete") {
                              deleteProject(doc.id);
                            }
                          },
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}